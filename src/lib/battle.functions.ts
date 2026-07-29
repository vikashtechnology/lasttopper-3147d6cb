import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { QuizQuestion } from "@/lib/learning.functions";
import { aiChat } from "@/lib/ai-router";

/* ----------------------------- AI generation ----------------------------- */

async function callGemini(prompt: string, count: number, model = "google/gemini-2.5-flash"): Promise<QuizQuestion[]> {
  const data = await aiChat({
    model,
    messages: [
      { role: "system", content: "You are an NCERT-only exam question generator. Only use content from official NCERT textbooks (Class 11 & 12). Output STRICT JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });
  const content: string = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as {
    questions?: Array<Omit<QuizQuestion, "id" | "chapter_id">>;
  };
  return (parsed.questions ?? []).slice(0, count).map((q, i) => ({
    id: `bq_${Date.now()}_${i}`,
    chapter_id: "",
    question: q.question,
    options: q.options,
    correct: q.correct,
    hint: q.hint ?? "",
    explanation: q.explanation ?? "",
  }));
}


/* --------------------------------- Wallet -------------------------------- */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type AuthedSupabase = SupabaseClient<Database>;

async function addTxn(
  supabase: AuthedSupabase,
  userId: string,
  type: "credit" | "debit",
  category: string,
  amount: number,
  note: string,
  referenceId?: string,
) {
  const { data: u } = await supabase.from("users").select("balance").eq("id", userId).maybeSingle();
  const cur = Number(u?.balance ?? 0);
  const next = type === "credit" ? cur + amount : cur - amount;
  if (next < 0) throw new Error("Insufficient balance");
  await supabase.from("users").update({ balance: next }).eq("id", userId);
  await supabase.from("wallet_transactions").insert({
    user_id: userId, type, category, amount, balance_after: next, note, reference_id: referenceId ?? null,
  });
  return next;
}

export const getWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: u } = await context.supabase
      .from("users").select("balance, mega_credits").eq("id", context.userId).maybeSingle();
    const { data: txns } = await context.supabase
      .from("wallet_transactions")
      .select("id, type, category, amount, balance_after, note, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      balance: Number(u?.balance ?? 0),
      mega_credits: Number(u?.mega_credits ?? 0),
      transactions: txns ?? [],
    };
  });


/* ------------------------------ Quick battle ----------------------------- */

const QUICK_TOTAL = 10;
const QUICK_BATCH = 5;

async function generateQuickBatch(profession: string, count: number, batchIdx: number, mode: "quick" | "1v1" = "quick"): Promise<QuizQuestion[]> {
  const subjectLabel = profession === "pcm"
    ? "JEE (Physics, Chemistry, Math)" : "NEET (Physics, Chemistry, Biology)";
  const prompt = `Generate exactly ${count} exam-style MCQ for ${subjectLabel}. STRICT SOURCE: use ONLY content from official NCERT Class 11 & 12 textbooks — no non-NCERT facts. Mix chapters and difficulty. Use LaTeX ($...$ / $$...$$) for math. Return STRICT JSON: {"questions":[{"question":"...","options":{"A":"","B":"","C":"","D":""},"correct":"A|B|C|D","hint":"...","explanation":"..."}]}`;
  const model = mode === "1v1" ? "google/gemini-3.5-flash" : "google/gemini-3.6-flash";
  const qs = await callGemini(prompt, count, model);
  return qs.map((q, i) => ({ ...q, id: `bq_${Date.now()}_${batchIdx}_${i}` }));
}


async function generateWithFallback(
  profession: string,
  count: number,
  batchIdx: number,
  mode: "quick" | "1v1",
): Promise<QuizQuestion[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { saveToBank, sampleFromBank } = await import("@/lib/question-bank.server");
  try {
    const qs = await generateQuickBatch(profession, count, batchIdx, mode);
    void saveToBank(supabaseAdmin, profession, qs, null);
    return qs;
  } catch (e) {
    const bank = await sampleFromBank(supabaseAdmin, profession, count);
    if (bank.length >= Math.min(count, 3)) return bank;
    throw e;
  }
}

export const startQuickBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("users").select("profession").eq("id", context.userId).maybeSingle();
    const profession = profile?.profession;
    if (!profession) throw new Error("Complete onboarding first");
    const first = await generateWithFallback(profession, QUICK_BATCH, 0, "quick");
    const { data: row, error } = await context.supabase
      .from("battle_sessions")
      .insert({ user_id: context.userId, mode: "quick", profession, questions: first as unknown as never })
      .select("id").single();
    if (error) throw error;
    return { id: row.id as string, questions: first, target: QUICK_TOTAL };
  });

export const start1v1Battle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("users").select("profession").eq("id", context.userId).maybeSingle();
    const profession = profile?.profession;
    if (!profession) throw new Error("Complete onboarding first");
    const first = await generateWithFallback(profession, QUICK_BATCH, 0, "1v1");
    const { data: row, error } = await context.supabase
      .from("battle_sessions")
      .insert({ user_id: context.userId, mode: "1v1", profession, questions: first as unknown as never })
      .select("id").single();
    if (error) throw error;
    return { id: row.id as string, questions: first, target: QUICK_TOTAL };
  });

export const extendQuickBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("battle_sessions").select("questions, profession, submitted_at, mode")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!s) throw new Error("Not found");
    const mode = s.mode as string;
    if (s.submitted_at || (mode !== "quick" && mode !== "1v1")) return { done: true as const, questions: (s?.questions as QuizQuestion[]) ?? [] };
    const cur = (s.questions as QuizQuestion[]) ?? [];
    if (cur.length >= QUICK_TOTAL) return { done: true as const, questions: cur };
    const n = Math.min(QUICK_BATCH, QUICK_TOTAL - cur.length);
    const batchIdx = Math.floor(cur.length / QUICK_BATCH);
    const more = await generateWithFallback(s.profession as string, n, batchIdx, mode === "1v1" ? "1v1" : "quick");
    const next = [...cur, ...more];
    await context.supabase.from("battle_sessions")
      .update({ questions: next as unknown as never })
      .eq("id", data.id).eq("user_id", context.userId);
    return { done: next.length >= QUICK_TOTAL, questions: next };
  });


const submitBattleSchema = z.object({
  id: z.string().uuid(),
  answers: z.record(z.string(), z.enum(["A", "B", "C", "D"])),
  time_taken_seconds: z.number().int().nonnegative(),
});

export const submitBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitBattleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("battle_sessions")
      .select("questions, submitted_at, mode, mega_test_id")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!s) throw new Error("Not found");
    if (s.submitted_at) return { already: true as const, correct: 0, total: 0, score: 0 };
    const qs = (s.questions as QuizQuestion[]) ?? [];
    let correct = 0;
    for (const q of qs) if (data.answers[q.id] && data.answers[q.id] === q.correct) correct += 1;
    const score = correct * 10;
    await context.supabase.from("battle_sessions").update({
      answers: data.answers, score, correct_count: correct,
      time_taken_seconds: data.time_taken_seconds, submitted_at: new Date().toISOString(),
    }).eq("id", data.id).eq("user_id", context.userId);
    if (s.mode === "mega" && s.mega_test_id) {
      await context.supabase.from("mega_test_entries")
        .update({ score, correct_count: correct })
        .eq("mega_test_id", s.mega_test_id).eq("user_id", context.userId);
    }
    const { awardQuestionXp } = await import("@/lib/xp.server");
    const xp = await awardQuestionXp(context.supabase, context.userId, correct).catch(() => null);
    return { already: false as const, correct, total: qs.length, score, xp_gained: xp?.gained ?? 0 };
  });

export const getBattleSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("battle_sessions").select("*")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    return s;
  });

/* -------------------------------- Leaderboards --------------------------- */

export const getQuickLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("battle_sessions")
      .select("id, user_id, score, correct_count, time_taken_seconds, submitted_at")
      .eq("mode", "quick").not("submitted_at", "is", null).gt("submitted_at", since)
      .order("score", { ascending: false })
      .order("time_taken_seconds", { ascending: true })
      .limit(10);
    const rows = data ?? [];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
    const { data: users } = userIds.length
      ? await supabaseAdmin.from("public_profiles").select("id, full_name, avatar_url").in("id", userIds)
      : { data: [] as Array<{ id: string; full_name: string | null; avatar_url: string | null }> };
    const map = new Map((users ?? []).map((u) => [u.id, u] as const));

    // Showcase-only demo players (display in leaderboard/history; cannot join mega battles)
    const { data: demo } = await (supabaseAdmin as any)
      .from("demo_players")
      .select("id, full_name, avatar_url, xp, score, correct_count, time_taken_seconds");

    type Row = {
      key: string;
      user: { full_name: string | null; avatar_url: string | null; email: string | null };
      score: number;
      correct_count: number;
      time_taken_seconds: number | null;
      xp: number | null;
      is_me: boolean;
      is_demo: boolean;
    };

    const real: Row[] = rows.map((r) => {
      const u = map.get(r.user_id as string);
      return {
        key: r.id as string,
        user: { full_name: u?.full_name ?? null, avatar_url: u?.avatar_url ?? null, email: null },
        score: r.score as number,
        correct_count: r.correct_count as number,
        time_taken_seconds: r.time_taken_seconds as number | null,
        xp: null,
        is_me: r.user_id === context.userId,
        is_demo: false,
      };
    });

    const demoRows: Row[] = ((demo ?? []) as any[]).map((d) => ({
      key: `demo-${d.id}`,
      user: { full_name: d.full_name as string, avatar_url: (d.avatar_url as string | null) ?? null, email: null },
      score: Number(d.score ?? 0),
      correct_count: Number(d.correct_count ?? 0),
      time_taken_seconds: Number(d.time_taken_seconds ?? 0),
      xp: Number(d.xp ?? 0),
      is_me: false,
      is_demo: true,
    }));

    return [...real, ...demoRows]
      .sort((a, b) => b.score - a.score || (a.time_taken_seconds ?? 9999) - (b.time_taken_seconds ?? 9999))
      .slice(0, 50)
      .map((r, i) => ({ rank: i + 1, ...r }));
  });


/* --------------------------------- Mega Test ----------------------------- */

// Next Sunday 10:00 IST = 04:30 UTC. 3-hour window.
function nextSundayIST(): { start: Date; end: Date } {
  const now = new Date();
  for (let i = 0; i < 8; i += 1) {
    const cand = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    cand.setUTCHours(4, 30, 0, 0);
    if (cand.getUTCDay() === 0 && cand.getTime() + 3 * 60 * 60 * 1000 > now.getTime()) {
      return { start: cand, end: new Date(cand.getTime() + 3 * 60 * 60 * 1000) };
    }
  }
  return { start: now, end: now };
}

export const getUpcomingMegaTest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("users").select("profession").eq("id", context.userId).maybeSingle();
    const profession = profile?.profession;
    if (!profession) return null;
    const { start, end } = nextSundayIST();
    const { data: existing } = await context.supabase
      .from("mega_tests").select("*")
      .eq("profession", profession).eq("scheduled_start", start.toISOString()).maybeSingle();
    let test = existing;
    if (!test) {
      const { data: inserted, error } = await context.supabase.from("mega_tests")
        .insert({
          profession,
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          status: "scheduled", entry_fee: 10, min_participants: 50, question_count: 180,
        })
        .select("*").single();
      if (error) throw error;
      test = inserted;
    }
    const { data: entry } = await context.supabase
      .from("mega_test_entries")
      .select("id, paid, refunded, session_id, score, rank, prize")
      .eq("mega_test_id", test.id).eq("user_id", context.userId).maybeSingle();
    const { count } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("mega_test_entries").select("id", { count: "exact", head: true })
      .eq("mega_test_id", test.id).eq("paid", true);
    return { test, entry, participants: count ?? 0 };
  });

export const joinMegaTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mega_test_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: test } = await context.supabase
      .from("mega_tests").select("id, entry_fee, status")
      .eq("id", data.mega_test_id).maybeSingle();
    if (!test) throw new Error("Test not found");
    if (test.status === "completed" || test.status === "cancelled") throw new Error("Registration closed");
    const { data: existing } = await context.supabase
      .from("mega_test_entries").select("id, paid")
      .eq("mega_test_id", data.mega_test_id).eq("user_id", context.userId).maybeSingle();
    if (existing?.paid) return { already: true as const };
    const fee = Number(test.entry_fee);

    // Spend Mega-Test-only credits (from referrals) first, then wallet balance.
    const { data: u } = await context.supabase
      .from("users").select("balance, mega_credits").eq("id", context.userId).maybeSingle();
    const megaCr = Number(u?.mega_credits ?? 0);
    const bal = Number(u?.balance ?? 0);
    const useFromCredits = Math.min(megaCr, fee);
    const useFromBalance = fee - useFromCredits;
    if (useFromBalance > bal) throw new Error("Insufficient balance");

    if (useFromCredits > 0) {
      await context.supabase
        .from("users").update({ mega_credits: megaCr - useFromCredits }).eq("id", context.userId);
      await context.supabase.from("wallet_transactions").insert({
        user_id: context.userId, type: "debit", category: "entry_fee",
        amount: useFromCredits, balance_after: bal,
        note: `Sunday Mega Test entry (referral credits)`, reference_id: data.mega_test_id,
      });
    }
    if (useFromBalance > 0) {
      await addTxn(
        context.supabase, context.userId, "debit", "entry_fee",
        useFromBalance, "Sunday Mega Test entry", data.mega_test_id,
      );
    }
    if (existing) {
      await context.supabase.from("mega_test_entries").update({ paid: true }).eq("id", existing.id);
    } else {
      await context.supabase.from("mega_test_entries")
        .insert({ mega_test_id: data.mega_test_id, user_id: context.userId, paid: true });
    }
    return { already: false as const };
  });

export const startMegaSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mega_test_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: test } = await context.supabase
      .from("mega_tests").select("*").eq("id", data.mega_test_id).maybeSingle();
    if (!test) throw new Error("Test not found");
    const now = Date.now();
    const start = new Date(test.scheduled_start as string).getTime();
    const end = new Date(test.scheduled_end as string).getTime();
    if (now < start) throw new Error("Test hasn't started yet");
    if (now > end) throw new Error("Test has ended");
    const { data: entry } = await context.supabase
      .from("mega_test_entries").select("id, paid, session_id")
      .eq("mega_test_id", data.mega_test_id).eq("user_id", context.userId).maybeSingle();
    if (!entry?.paid) throw new Error("Join first to play");
    if (entry.session_id) return { id: entry.session_id as string };
    let questions = (test.questions as QuizQuestion[] | null) ?? null;
    // If not yet generated for this test, look for a shared set generated for the same time slot
    // (one set is shared across all professions for fairness).
    if (!questions || questions.length === 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: peer } = await supabaseAdmin
        .from("mega_tests")
        .select("questions")
        .eq("scheduled_start", test.scheduled_start as string)
        .not("questions", "is", null)
        .limit(1)
        .maybeSingle();
      const shared = (peer?.questions as QuizQuestion[] | null) ?? null;
      if (shared && shared.length > 0) {
        questions = shared;
        await supabaseAdmin.from("mega_tests")
          .update({ questions: shared as unknown as never, status: "live" })
          .eq("id", data.mega_test_id);
      }
    }
    if (!questions || questions.length === 0) {
      throw new Error("Test questions are still being prepared. Please try again in a minute.");
    }
    const { data: row, error } = await context.supabase
      .from("battle_sessions")
      .insert({
        user_id: context.userId, mode: "mega",
        profession: test.profession, mega_test_id: data.mega_test_id,
        questions: questions as unknown as never,
      })
      .select("id").single();
    if (error) throw error;
    await context.supabase.from("mega_test_entries").update({ session_id: row.id }).eq("id", entry.id);
    return { id: row.id as string };
  });


/* ----------------------------- Withdrawals ------------------------------- */

const withdrawSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["upi", "bank"]),
  upi_id: z.string().optional(),
  account_name: z.string().optional(),
  account_number: z.string().optional(),
  ifsc: z.string().optional(),
  bank_name: z.string().optional(),
});

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => withdrawSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: u } = await context.supabase
      .from("users").select("balance, full_name, email").eq("id", context.userId).maybeSingle();
    const bal = Number(u?.balance ?? 0);
    if (data.amount > bal) throw new Error("Insufficient balance");
    await addTxn(context.supabase, context.userId, "debit", "withdrawal", data.amount, "Withdrawal requested");
    const { data: row, error } = await context.supabase
      .from("withdrawal_requests")
      .insert({
        user_id: context.userId, amount: data.amount, method: data.method,
        upi_id: data.upi_id ?? null, account_name: data.account_name ?? null,
        account_number: data.account_number ?? null, ifsc: data.ifsc ?? null,
        bank_name: data.bank_name ?? null,
      })
      .select("id, process_after, short_code").single();
    if (error) throw error;
    try {
      const { safeFileName, sendTelegramDocument } = await import("@/lib/telegram-alert");
      const who = u?.full_name ?? u?.email ?? context.userId;
      const details =
        data.method === "upi"
          ? [`UPI ID        : ${data.upi_id ?? "-"}`]
          : [
              `Bank          : ${data.bank_name ?? "-"}`,
              `Account name  : ${data.account_name ?? "-"}`,
              `Account number: ${data.account_number ?? "-"}`,
              `IFSC          : ${data.ifsc ?? "-"}`,
            ];
      const body = [
        "WITHDRAWAL REQUEST",
        "====================",
        `Request ID    : ${row.short_code}`,
        `User          : ${who}`,
        `Email         : ${u?.email ?? "-"}`,
        `Amount        : ${data.amount} TC (₹${data.amount})`,
        `Method        : ${data.method.toUpperCase()}`,
        ...details,
        `Requested at  : ${new Date().toISOString()}`,
        "",
        "Reply with:",
        `/approve id=${row.short_code}`,
        `/reject id=${row.short_code}   (auto-refunds wallet)`,
      ].join("\n");
      const fileName = safeFileName([String(who), `withdrawal_${row.short_code}`], "txt");
      await sendTelegramDocument(
        fileName,
        body,
        `💸 <b>Withdrawal #${row.short_code}</b> — ₹${data.amount}\n<code>/approve id=${row.short_code}</code>\n<code>/reject id=${row.short_code}</code>`,
      );
    } catch { /* non-fatal */ }

    return { id: row.id, process_after: row.process_after };
  });

export const getWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("withdrawal_requests")
      .select("id, amount, method, status, process_after, processed_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false }).limit(20);
    return data ?? [];
  });

export const getBattleHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("battle_sessions")
      .select("id, mode, score, correct_count, time_taken_seconds, submitted_at, mega_test_id")
      .eq("user_id", context.userId).not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }).limit(30);
    return data ?? [];
  });
