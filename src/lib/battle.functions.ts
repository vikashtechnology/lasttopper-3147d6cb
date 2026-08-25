import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { QuizQuestion } from "@/lib/learning.functions";
import { aiChat } from "@/lib/ai-router";

/* ----------------------------- AI generation ----------------------------- */

async function callGemini(
  prompt: string,
  count: number,
  model = "google/gemini-2.5-flash",
): Promise<QuizQuestion[]> {
  const data = await aiChat({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an NCERT-only exam question generator. Only use content from official NCERT textbooks (Class 11 & 12). Output STRICT JSON only.",
      },
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

/* ------------------------------ Quick battle ----------------------------- */

const QUICK_TOTAL = 10;
const QUICK_BATCH = 5;

export type BattleQuestion = Omit<QuizQuestion, "correct" | "hint" | "explanation">;

function publicBattleQuestions(questions: QuizQuestion[]): BattleQuestion[] {
  return questions.map(
    ({ correct: _correct, hint: _hint, explanation: _explanation, ...question }) => question,
  );
}

async function generateQuickBatch(
  profession: string,
  count: number,
  batchIdx: number,
  mode: "quick" | "1v1" = "quick",
): Promise<QuizQuestion[]> {
  const subjectLabel =
    profession === "pcm" ? "JEE (Physics, Chemistry, Math)" : "NEET (Physics, Chemistry, Biology)";
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
      .from("users")
      .select("profession")
      .eq("id", context.userId)
      .maybeSingle();
    const profession = profile?.profession;
    if (!profession) throw new Error("Complete onboarding first");
    const first = await generateWithFallback(profession, QUICK_BATCH, 0, "quick");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("battle_sessions")
      .insert({
        user_id: context.userId,
        mode: "quick",
        profession,
        questions: first as unknown as never,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string, questions: publicBattleQuestions(first), target: QUICK_TOTAL };
  });

export const start1v1Battle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("users")
      .select("profession")
      .eq("id", context.userId)
      .maybeSingle();
    const profession = profile?.profession;
    if (!profession) throw new Error("Complete onboarding first");
    const first = await generateWithFallback(profession, QUICK_BATCH, 0, "1v1");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("battle_sessions")
      .insert({
        user_id: context.userId,
        mode: "1v1",
        profession,
        questions: first as unknown as never,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string, questions: publicBattleQuestions(first), target: QUICK_TOTAL };
  });

export const extendQuickBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin
      .from("battle_sessions")
      .select("questions, profession, submitted_at, mode")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!s) throw new Error("Not found");
    const mode = s.mode as string;
    if (s.submitted_at || (mode !== "quick" && mode !== "1v1"))
      return {
        done: true as const,
        questions: publicBattleQuestions((s?.questions as QuizQuestion[]) ?? []),
      };
    const cur = (s.questions as QuizQuestion[]) ?? [];
    if (cur.length >= QUICK_TOTAL)
      return { done: true as const, questions: publicBattleQuestions(cur) };
    const n = Math.min(QUICK_BATCH, QUICK_TOTAL - cur.length);
    const batchIdx = Math.floor(cur.length / QUICK_BATCH);
    const more = await generateWithFallback(
      s.profession as string,
      n,
      batchIdx,
      mode === "1v1" ? "1v1" : "quick",
    );
    const next = [...cur, ...more];
    const { error: updateError } = await supabaseAdmin
      .from("battle_sessions")
      .update({ questions: next as unknown as never })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (updateError) throw updateError;
    return {
      done: next.length >= QUICK_TOTAL,
      questions: publicBattleQuestions(next),
    };
  });

const submitBattleSchema = z.object({
  id: z.string().uuid(),
  answers: z
    .record(z.string().max(128), z.enum(["A", "B", "C", "D"]))
    .refine((answers) => Object.keys(answers).length <= 200, "Too many answers"),
});

export const submitBattle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitBattleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The service-role-only RPC locks the session, scores against the paper
    // inside the transaction, derives elapsed time from database timestamps,
    // rejects late/replayed submissions, and atomically updates a Mega entry.
    const { data: submissionData, error: submissionError } = await (supabaseAdmin as any).rpc(
      "submit_battle_result",
      {
        p_session_id: data.id,
        p_user_id: context.userId,
        p_answers: data.answers,
      },
    );
    if (submissionError) throw submissionError;
    const submission = Array.isArray(submissionData) ? submissionData[0] : submissionData;
    if (!submission) throw new Error("Battle submission failed");
    const correct = Number(submission.correct_count ?? 0);
    const total = Number(submission.total ?? 0);
    const score = Number(submission.score ?? 0);

    // The XP ledger is independently idempotent, so a retry can safely repair
    // an award if the original request ended after the score was committed.
    const { awardQuestionXp } = await import("@/lib/xp.server");
    const xp = await awardQuestionXp(supabaseAdmin, context.userId, correct, {
      type: "battle",
      id: data.id,
    }).catch(() => null);
    return {
      already: !submission.submitted,
      correct,
      total,
      score,
      xp_gained: xp?.gained ?? 0,
    };
  });

export const getBattleSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session, error } = await supabaseAdmin
      .from("battle_sessions")
      .select("id, mode, profession, mega_test_id, questions, submitted_at, start_time")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return null;

    let endsAt = new Date(session.start_time).getTime() + 3 * 60 * 60_000;
    if (session.mode === "mega" && session.mega_test_id) {
      const { data: test, error: testError } = await supabaseAdmin
        .from("mega_tests")
        .select("scheduled_end")
        .eq("id", session.mega_test_id)
        .maybeSingle();
      if (testError) throw testError;
      if (test) endsAt = new Date(test.scheduled_end).getTime();
    }

    // Never send answer keys, hints, or explanations to an active browser.
    // Authenticated clients also lose direct table access in the hardening
    // migration, so network/devtools inspection cannot reveal correct answers.
    const questions = publicBattleQuestions((session.questions as QuizQuestion[]) ?? []);
    return { ...session, questions, ends_at: new Date(endsAt).toISOString() };
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
      .eq("mode", "quick")
      .not("submitted_at", "is", null)
      .gt("submitted_at", since)
      .order("score", { ascending: false })
      .order("time_taken_seconds", { ascending: true })
      .limit(10);
    const rows = data ?? [];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
    const { data: users } = userIds.length
      ? await supabaseAdmin
          .from("public_profiles")
          .select("id, full_name, avatar_url")
          .in("id", userIds)
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
      user: {
        full_name: d.full_name as string,
        avatar_url: (d.avatar_url as string | null) ?? null,
        email: null,
      },
      // Quick battles award 10 points per correct answer. Historical showcase
      // rows stored a larger XP-like value in `score`, which made the demo
      // players impossible for real users (maximum 100) to outrank.
      score: Number(d.correct_count ?? 0) * 10,
      correct_count: Number(d.correct_count ?? 0),
      time_taken_seconds: Number(d.time_taken_seconds ?? 0),
      xp: Number(d.xp ?? 0),
      is_me: false,
      is_demo: true,
    }));

    return [...real, ...demoRows]
      .sort(
        (a, b) =>
          b.score - a.score || (a.time_taken_seconds ?? 9999) - (b.time_taken_seconds ?? 9999),
      )
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
      .from("users")
      .select("profession")
      .eq("id", context.userId)
      .maybeSingle();
    const profession = profile?.profession;
    if (!profession) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { start, end } = nextSundayIST();
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("mega_tests")
      .select(
        "id, profession, scheduled_start, scheduled_end, status, min_participants, question_count, created_at",
      )
      .eq("profession", profession)
      .eq("scheduled_start", start.toISOString())
      .maybeSingle();
    if (existingError) throw existingError;
    let test = existing;
    if (!test) {
      // Provisioning is a trusted server operation. Authenticated users only
      // have read access to mega_tests, so inserts must use the service client.
      const { data: inserted, error } = await supabaseAdmin
        .from("mega_tests")
        .upsert(
          {
            profession,
            scheduled_start: start.toISOString(),
            scheduled_end: end.toISOString(),
            status: "scheduled",
            min_participants: 50,
            question_count: 180,
          },
          { onConflict: "profession,scheduled_start" },
        )
        .select(
          "id, profession, scheduled_start, scheduled_end, status, min_participants, question_count, created_at",
        )
        .single();
      if (error) throw error;
      test = inserted;
    }
    const { data: entry, error: entryError } = await (context.supabase as any)
      .from("mega_test_entries")
      .select("id, access_verified_at, session_id, score, rank")
      .eq("mega_test_id", test.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (entryError) throw entryError;
    const { count, error: countError } = await supabaseAdmin
      .from("mega_test_entries")
      .select("id", { count: "exact", head: true })
      .eq("mega_test_id", test.id)
      .not("access_verified_at", "is", null);
    if (countError) throw countError;
    return { test, entry, participants: count ?? 0 };
  });

export const joinMegaTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mega_test_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: registrationData, error } = await (supabaseAdmin as any).rpc(
      "register_free_mega_test",
      { p_mega_test_id: data.mega_test_id, p_user_id: context.userId },
    );
    if (error) throw error;
    const registration = Array.isArray(registrationData) ? registrationData[0] : registrationData;
    if (!registration) throw new Error("Mega Test registration failed");
    return { already: !!registration.already_registered };
  });

export const startMegaSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mega_test_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: test, error: testError } = await supabaseAdmin
      .from("mega_tests")
      .select("*")
      .eq("id", data.mega_test_id)
      .maybeSingle();
    if (testError) throw testError;
    if (!test) throw new Error("Test not found");
    const now = Date.now();
    const start = new Date(test.scheduled_start as string).getTime();
    const end = new Date(test.scheduled_end as string).getTime();
    if (now < start) throw new Error("Test hasn't started yet");
    if (now > end) throw new Error("Test has ended");
    const { data: entry, error: entryError } = await (context.supabase as any)
      .from("mega_test_entries")
      .select("id, access_verified_at")
      .eq("mega_test_id", data.mega_test_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (entryError) throw entryError;
    if (!entry?.access_verified_at) throw new Error("Complete all access tasks and register first");
    // The RPC revalidates the live window and every per-Mega completion even
    // when an existing session is returned. Never bypass it client-side.
    let questions = (test.questions as QuizQuestion[] | null) ?? null;
    // If not yet generated for this test, look for a shared set generated for the same time slot
    // (one set is shared across all professions for fairness).
    if (!questions || questions.length === 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: peer, error: peerError } = await supabaseAdmin
        .from("mega_tests")
        .select("questions")
        .eq("scheduled_start", test.scheduled_start as string)
        .not("questions", "is", null)
        .limit(1)
        .maybeSingle();
      if (peerError) throw peerError;
      const shared = (peer?.questions as QuizQuestion[] | null) ?? null;
      if (shared && shared.length === Number(test.question_count)) {
        questions = shared;
        const { error: updateError } = await supabaseAdmin
          .from("mega_tests")
          .update({ questions: shared as unknown as never, status: "live" })
          .eq("id", data.mega_test_id);
        if (updateError) throw updateError;
      }
    }
    if (!questions || questions.length === 0) {
      throw new Error("Test questions are still being prepared. Please try again in a minute.");
    }
    const { data: sessionData, error: sessionError } = await (supabaseAdmin as any).rpc(
      "start_mega_battle_session",
      {
        p_mega_test_id: data.mega_test_id,
        p_user_id: context.userId,
      },
    );
    if (sessionError) throw sessionError;
    const session = Array.isArray(sessionData) ? sessionData[0] : sessionData;
    if (!session?.session_id) throw new Error("Mega Test session could not be started");
    return { id: session.session_id as string };
  });

export const getBattleHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("battle_sessions")
      .select("id, mode, score, correct_count, time_taken_seconds, submitted_at, mega_test_id")
      .eq("user_id", context.userId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  });
