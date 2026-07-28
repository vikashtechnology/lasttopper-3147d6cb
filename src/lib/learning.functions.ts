import { createServerFn } from "@tanstack/react-start";
import { aiChat } from "@/lib/ai-router";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Chapter = {
  id: string;
  subject_id: string;
  name: string;
  class_level: number;
  display_order: number;
};

export type SubjectWithChapters = {
  id: string;
  code: string;
  name: string;
  profession: string;
  display_order: number;
  chapters: Chapter[];
};

export type QuizQuestion = {
  id: string;
  chapter_id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct: "A" | "B" | "C" | "D";
  hint: string;
  explanation: string;
};

export const getSubjectsWithChapters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("users")
      .select("profession")
      .eq("id", context.userId)
      .maybeSingle();
    const profession = profile?.profession;
    if (!profession) return [] as SubjectWithChapters[];

    const { data: subjects, error: sErr } = await context.supabase
      .from("subjects")
      .select("id, code, name, profession, display_order")
      .eq("profession", profession)
      .order("display_order");
    if (sErr) throw sErr;

    const { data: chapters, error: cErr } = await context.supabase
      .from("chapters")
      .select("id, subject_id, name, class_level, display_order")
      .in("subject_id", (subjects ?? []).map((s) => s.id))
      .order("class_level")
      .order("display_order");
    if (cErr) throw cErr;

    return (subjects ?? []).map((s) => ({
      ...s,
      chapters: (chapters ?? []).filter((c) => c.subject_id === s.id),
    })) as SubjectWithChapters[];
  });

const generateSchema = z.object({
  chapter_ids: z.array(z.string().uuid()).min(1),
  question_count: z.union([z.literal(20), z.literal(50), z.literal(100)]),
});

async function callGeminiBatch(
  chapterNames: string[],
  profession: string,
  count: number,
  batchIndex: number,
): Promise<QuizQuestion[]> {
  const subjectLabel = profession === "pcm" ? "JEE (Physics, Chemistry, Math)" : "NEET (Physics, Chemistry, Biology)";
  const prompt = `Generate exactly ${count} exam-style multiple-choice questions for ${subjectLabel}, distributed across these chapters: ${chapterNames.join(", ")}.

STRICT SOURCE POLICY:
- Every question, option, hint and explanation MUST be grounded strictly in the official NCERT textbook syllabus for the given chapters and class (NCERT Class 11 & 12 for JEE/NEET).
- Do NOT invent facts or use content that is not present in NCERT.
- If a chapter is not covered in NCERT, skip it and rebalance to NCERT chapters only.
- Prefer NCERT terminology, definitions, and formula conventions.

Rules:
- Cover a mix of easy, medium, and hard difficulty (roughly 30/40/30).
- Use LaTeX for all math/formulas: single $...$ for inline, $$...$$ for display.
- 4 options labeled A, B, C, D — exactly one correct.
- Provide a short hint (1 sentence) and a clear step-by-step explanation that cites the NCERT chapter/topic where relevant.
- This is batch #${batchIndex + 1}; produce a fresh set of questions.
- Return STRICT JSON only, no markdown, matching this schema:
{"questions":[{"chapter":"<chapter name>","question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"A|B|C|D","hint":"...","explanation":"..."}]}`;

  let data: any;
  try {
    data = await aiChat({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are an NCERT-only exam question generator. You must only use content that appears in official NCERT textbooks. Output STRICT JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
  } catch {
    throw new Error("AI_BUSY");
  }
  const content: string = data?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { questions?: Array<Omit<QuizQuestion, "id" | "chapter_id"> & { chapter: string }> } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  const raw = parsed.questions ?? [];
  return raw.slice(0, count).map((q, i) => ({
    id: `q_${Date.now()}_${batchIndex}_${i}`,
    chapter_id: "",
    question: q.question,
    options: q.options,
    correct: q.correct,
    hint: q.hint,
    explanation: q.explanation,
  }));
}

async function callGeminiForQuestions(
  chapterNames: string[],
  profession: string,
  count: number,
): Promise<QuizQuestion[]> {
  // Batch large requests so a single slow/oversized response doesn't tank the whole set.
  const BATCH = 25;
  const batches: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    const n = Math.min(BATCH, remaining);
    batches.push(n);
    remaining -= n;
  }

  // Run batches in parallel with per-batch retry for much faster 50/100 generation.
  const settled = await Promise.all(
    batches.map(async (n, i) => {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const got = await callGeminiBatch(chapterNames, profession, n, i);
          if (got.length > 0) return got;
        } catch (e) {
          lastErr = e;
          if (e instanceof Error && e.message === "AI_BUSY") throw e;
        }
      }
      if (lastErr instanceof Error) throw lastErr;
      return [] as QuizQuestion[];
    }),
  );

  const results = settled.flat();
  if (results.length === 0) throw new Error("AI returned no questions");
  return results.slice(0, count);
}


export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("users")
      .select("profession, is_pro")
      .eq("id", context.userId)
      .maybeSingle();
    const profession = profile?.profession;
    if (!profession) throw new Error("Complete onboarding first");
    if (data.question_count > 20 && !profile?.is_pro) {
      throw new Error("PRO_REQUIRED");
    }
    {
      const { assertQuota } = await import("@/lib/quota.server");
      await assertQuota(context.supabase, context.userId, data.question_count);
    }


    const { data: cached } = await context.supabase
      .from("generated_questions")
      .select("id, questions, created_at")
      .eq("user_id", context.userId)
      .eq("question_count", data.question_count)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(5);

    const targetKey = [...data.chapter_ids].sort().join(",");
    const hit = (cached ?? []).find((c) => {
      const qs = c.questions as QuizQuestion[];
      const chSet = Array.from(new Set(qs.map((q) => q.chapter_id))).sort().join(",");
      return chSet === targetKey;
    });
    if (hit) return { questions: hit.questions as QuizQuestion[], cached: true };

    const { data: chapters } = await context.supabase
      .from("chapters")
      .select("id, name")
      .in("id", data.chapter_ids);
    const nameById = new Map((chapters ?? []).map((c) => [c.id, c.name] as const));
    const chapterNames = data.chapter_ids.map((id) => nameById.get(id) ?? "").filter(Boolean);

    let questions: QuizQuestion[];
    try {
      questions = await callGeminiForQuestions(chapterNames, profession, data.question_count);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // AI failed — try the fallback bank
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sampleFromBank } = await import("@/lib/question-bank.server");
      const bank = await sampleFromBank(supabaseAdmin, profession, data.question_count, data.chapter_ids);
      if (bank.length >= Math.min(data.question_count, 5)) {
        return { questions: bank, cached: false, error: "Using saved questions (AI busy)." as const };
      }
      if (msg === "AI_BUSY") {
        return { questions: [] as QuizQuestion[], cached: false, error: "AI is busy — please try again in a minute." as const };
      }
      throw e;
    }

    questions = questions.map((q, i) => ({
      ...q,
      chapter_id: data.chapter_ids[i % data.chapter_ids.length],
    }));

    // Save AI-generated questions to the fallback bank (best effort)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { saveToBank } = await import("@/lib/question-bank.server");
      void saveToBank(supabaseAdmin, profession, questions);
    } catch { /* non-fatal */ }

    await context.supabase.from("generated_questions").insert({
      user_id: context.userId,
      chapter_ids: data.chapter_ids,
      profession,
      question_count: data.question_count,
      questions: questions as unknown as never,
    });

    return { questions, cached: false };
  });


/* ---------------- Progressive (5-at-a-time) generation ---------------- */

const startProgressiveSchema = z.object({
  chapter_ids: z.array(z.string().uuid()).min(1),
  target_count: z.union([z.literal(20), z.literal(50), z.literal(100)]),
  timer_enabled: z.boolean(),
  duration_seconds: z.number().int().positive().nullable(),
});

const PROG_BATCH = 5;

async function generateBatchForSession(
  supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>,
  userId: string,
  chapterIds: string[],
  count: number,
  batchIndex: number,
): Promise<QuizQuestion[]> {
  const { data: profile } = await supabase
    .from("users").select("profession").eq("id", userId).maybeSingle();
  const profession = profile?.profession;
  if (!profession) throw new Error("Complete onboarding first");
  const { data: chapters } = await supabase
    .from("chapters").select("id, name").in("id", chapterIds);
  const nameById = new Map((chapters ?? []).map((c) => [c.id, c.name] as const));
  const chapterNames = chapterIds.map((id) => nameById.get(id) ?? "").filter(Boolean);
  try {
    const qs = await callGeminiBatch(chapterNames, profession, count, batchIndex);
    const mapped = qs.map((q, i) => ({
      ...q,
      id: `q_${Date.now()}_${batchIndex}_${i}`,
      chapter_id: chapterIds[i % chapterIds.length],
    }));
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { saveToBank } = await import("@/lib/question-bank.server");
      void saveToBank(supabaseAdmin, profession, mapped);
    } catch { /* non-fatal */ }
    return mapped;
  } catch (e) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sampleFromBank } = await import("@/lib/question-bank.server");
    const bank = await sampleFromBank(supabaseAdmin, profession, count, chapterIds);
    if (bank.length >= Math.min(count, 3)) {
      return bank.map((q, i) => ({
        ...q,
        id: `q_${Date.now()}_${batchIndex}_${i}`,
        chapter_id: chapterIds[i % chapterIds.length],
      }));
    }
    throw e;
  }
}


export const startProgressiveQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => startProgressiveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("users").select("is_pro").eq("id", context.userId).maybeSingle();
    if (data.target_count > 20 && !profile?.is_pro) throw new Error("PRO_REQUIRED");
    {
      const { assertQuota } = await import("@/lib/quota.server");
      await assertQuota(context.supabase, context.userId, data.target_count);
    }


    const firstCount = Math.min(PROG_BATCH, data.target_count);
    let first: QuizQuestion[];
    try {
      first = await generateBatchForSession(
        context.supabase, context.userId, data.chapter_ids, firstCount, 0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "AI_BUSY") throw new Error("AI is busy — please try again in a minute.");
      throw e;
    }

    const nowIso = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("quiz_sessions")
      .insert({
        user_id: context.userId,
        chapter_ids: data.chapter_ids,
        question_count: data.target_count,
        questions: first as unknown as never,
        timer_enabled: data.timer_enabled,
        duration_seconds: data.duration_seconds,
        start_time: nowIso,
        last_heartbeat: nowIso,
      })
      .select("id").single();
    if (error) throw error;
    return { id: row.id as string, generated: first.length, target: data.target_count };
  });

export const extendQuizSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: s, error } = await context.supabase
      .from("quiz_sessions")
      .select("questions, question_count, chapter_ids, submitted_at")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    if (!s) throw new Error("Session not found");
    if (s.submitted_at) return { done: true as const, added: 0, total: (s.questions as QuizQuestion[]).length };
    const cur = (s.questions as QuizQuestion[]) ?? [];
    const target = Number(s.question_count ?? 0);
    if (cur.length >= target) return { done: true as const, added: 0, total: cur.length };

    const remaining = target - cur.length;
    const n = Math.min(PROG_BATCH, remaining);
    const batchIdx = Math.floor(cur.length / PROG_BATCH);
    const chapterIds = (s.chapter_ids as string[]) ?? [];
    const more = await generateBatchForSession(
      context.supabase, context.userId, chapterIds, n, batchIdx,
    );
    const next = [...cur, ...more];
    await context.supabase
      .from("quiz_sessions")
      .update({ questions: next as unknown as never })
      .eq("id", data.id).eq("user_id", context.userId);
    return { done: next.length >= target, added: more.length, total: next.length };
  });

const createSessionSchema = z.object({
  chapter_ids: z.array(z.string().uuid()).min(1),
  question_count: z.number().int().positive(),
  questions: z.array(z.any()),
  timer_enabled: z.boolean(),
  duration_seconds: z.number().int().positive().nullable(),
});

export const createQuizSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSessionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("quiz_sessions")
      .insert({
        user_id: context.userId,
        chapter_ids: data.chapter_ids,
        question_count: data.question_count,
        questions: data.questions,
        timer_enabled: data.timer_enabled,
        duration_seconds: data.duration_seconds,
        start_time: nowIso,
        last_heartbeat: nowIso,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const getQuizSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("quiz_sessions")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const heartbeatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("quiz_sessions")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("submitted_at", null);
    return { ok: true };
  });

function scoreQuestions(
  questions: QuizQuestion[],
  answers: Record<string, "A" | "B" | "C" | "D">,
) {
  let correct = 0;
  for (const q of questions) {
    if (answers[q.id] && answers[q.id] === q.correct) correct += 1;
  }
  const total = questions.length;
  const incorrect = total - correct;
  const accuracy = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;
  return { correct, incorrect, total, accuracy };
}

const submitSchema = z.object({
  id: z.string().uuid(),
  answers: z.record(z.string(), z.enum(["A", "B", "C", "D"])),
  time_taken_seconds: z.number().int().nonnegative(),
});

export const submitQuizSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: session, error: gErr } = await context.supabase
      .from("quiz_sessions")
      .select("questions, user_id, submitted_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!session) throw new Error("Session not found");
    if (session.submitted_at) {
      const questions = session.questions as QuizQuestion[];
      return scoreQuestions(questions, data.answers);
    }

    const questions = session.questions as QuizQuestion[];
    const { correct, incorrect, total, accuracy } = scoreQuestions(questions, data.answers);

    const { error: uErr } = await context.supabase
      .from("quiz_sessions")
      .update({
        answers: data.answers,
        score: correct,
        correct_count: correct,
        incorrect_count: incorrect,
        accuracy,
        time_taken_seconds: data.time_taken_seconds,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (uErr) throw uErr;

    // Refresh user's rolling accuracy across submitted sessions
    const { data: all } = await context.supabase
      .from("quiz_sessions")
      .select("accuracy")
      .eq("user_id", context.userId)
      .not("submitted_at", "is", null);
    if (all && all.length > 0) {
      const avg = all.reduce((sum, r) => sum + Number(r.accuracy ?? 0), 0) / all.length;
      await context.supabase
        .from("users")
        .update({ total_accuracy: Math.round(avg * 100) / 100 })
        .eq("id", context.userId);
    }

    return { correct, incorrect, total, accuracy };
  });

// Lazy check: auto-submit any live session whose last_heartbeat is stale (>2 min).
export const finalizeStaleSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: stale } = await context.supabase
      .from("quiz_sessions")
      .select("id, questions, answers, start_time, last_heartbeat")
      .eq("user_id", context.userId)
      .is("submitted_at", null)
      .lt("last_heartbeat", cutoff);

    const finalized: string[] = [];
    for (const s of stale ?? []) {
      const questions = (s.questions as QuizQuestion[]) ?? [];
      const answers = (s.answers as Record<string, "A" | "B" | "C" | "D">) ?? {};
      const { correct, incorrect, accuracy } = scoreQuestions(questions, answers);
      const startMs = new Date(s.start_time as string).getTime();
      const hbMs = new Date((s.last_heartbeat ?? s.start_time) as string).getTime();
      const timeTaken = Math.max(0, Math.floor((hbMs - startMs) / 1000));
      await context.supabase
        .from("quiz_sessions")
        .update({
          score: correct,
          correct_count: correct,
          incorrect_count: incorrect,
          accuracy,
          time_taken_seconds: timeTaken,
          submitted_at: new Date().toISOString(),
          was_auto_submitted: true,
        })
        .eq("id", s.id)
        .eq("user_id", context.userId);
      finalized.push(s.id as string);
    }
    return { finalized };
  });

export const getTodayUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data } = await context.supabase
      .from("quiz_sessions")
      .select("answers")
      .eq("user_id", context.userId)
      .gte("created_at", start.toISOString());
    // Only count questions the user actually attempted (answered).
    const used = (data ?? []).reduce((sum, r) => {
      const ans = (r.answers ?? {}) as Record<string, unknown>;
      return sum + Object.keys(ans).length;
    }, 0);
    return { used };
  });


export const getQuizHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("quiz_sessions")
      .select("id, question_count, correct_count, incorrect_count, accuracy, time_taken_seconds, submitted_at, was_auto_submitted, chapter_ids")
      .eq("user_id", context.userId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export type MistakeItem = {
  session_id: string;
  question: QuizQuestion;
  chosen: "A" | "B" | "C" | "D" | null;
  submitted_at: string;
};

export const getMistakes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("quiz_sessions")
      .select("id, questions, answers, submitted_at")
      .eq("user_id", context.userId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const items: MistakeItem[] = [];
    for (const s of data ?? []) {
      const qs = (s.questions as QuizQuestion[]) ?? [];
      const ans = (s.answers as Record<string, "A" | "B" | "C" | "D">) ?? {};
      for (const q of qs) {
        const chosen = ans[q.id] ?? null;
        if (chosen !== q.correct) {
          items.push({
            session_id: s.id as string,
            question: q,
            chosen,
            submitted_at: s.submitted_at as string,
          });
        }
      }
    }
    return items;
  });

export type Analytics = {
  totalAttempted: number;
  overallAccuracy: number;
  bySubject: Array<{ subject: string; accuracy: number; attempted: number }>;
  byChapter: Array<{ chapter_id: string; chapter: string; subject: string; accuracy: number; attempted: number }>;
  studyTimeByDay: Array<{ day: string; minutes: number }>;
  weakChapters: Array<{ chapter_id: string; chapter: string; subject: string; accuracy: number; attempted: number }>;
};

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Analytics> => {
    const { data: sessions } = await context.supabase
      .from("quiz_sessions")
      .select("questions, answers, submitted_at, time_taken_seconds")
      .eq("user_id", context.userId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(200);

    type ChAgg = { correct: number; attempted: number };
    const chapterAgg = new Map<string, ChAgg>();
    const studyByDay = new Map<string, number>();
    let totalAttempted = 0;
    let totalCorrect = 0;

    for (const s of sessions ?? []) {
      const qs = (s.questions as QuizQuestion[]) ?? [];
      const ans = (s.answers as Record<string, "A" | "B" | "C" | "D">) ?? {};
      for (const q of qs) {
        const chosen = ans[q.id];
        if (!chosen) continue;
        totalAttempted += 1;
        const isCorrect = chosen === q.correct;
        if (isCorrect) totalCorrect += 1;
        const cur = chapterAgg.get(q.chapter_id) ?? { correct: 0, attempted: 0 };
        cur.attempted += 1;
        if (isCorrect) cur.correct += 1;
        chapterAgg.set(q.chapter_id, cur);
      }
      if (s.submitted_at) {
        const day = new Date(s.submitted_at as string).toISOString().slice(0, 10);
        studyByDay.set(day, (studyByDay.get(day) ?? 0) + Math.round((s.time_taken_seconds ?? 0) / 60));
      }
    }

    const chapterIds = Array.from(chapterAgg.keys()).filter(Boolean);
    const { data: chapters } = chapterIds.length
      ? await context.supabase
          .from("chapters")
          .select("id, name, subject_id")
          .in("id", chapterIds)
      : { data: [] as Array<{ id: string; name: string; subject_id: string }> };
    const subjectIds = Array.from(new Set((chapters ?? []).map((c) => c.subject_id)));
    const { data: subjects } = subjectIds.length
      ? await context.supabase.from("subjects").select("id, name").in("id", subjectIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const subjectNameById = new Map((subjects ?? []).map((s) => [s.id, s.name] as const));
    const chapterMeta = new Map(
      (chapters ?? []).map((c) => [c.id, { name: c.name, subject: subjectNameById.get(c.subject_id) ?? "—" }] as const),
    );

    const byChapter = Array.from(chapterAgg.entries()).map(([id, v]) => {
      const meta = chapterMeta.get(id);
      return {
        chapter_id: id,
        chapter: meta?.name ?? "—",
        subject: meta?.subject ?? "—",
        accuracy: v.attempted > 0 ? Math.round((v.correct / v.attempted) * 1000) / 10 : 0,
        attempted: v.attempted,
      };
    });

    const subjectAgg = new Map<string, ChAgg>();
    for (const [id, v] of chapterAgg.entries()) {
      const subject = chapterMeta.get(id)?.subject ?? "—";
      const cur = subjectAgg.get(subject) ?? { correct: 0, attempted: 0 };
      cur.correct += v.correct;
      cur.attempted += v.attempted;
      subjectAgg.set(subject, cur);
    }
    const bySubject = Array.from(subjectAgg.entries()).map(([subject, v]) => ({
      subject,
      accuracy: v.attempted > 0 ? Math.round((v.correct / v.attempted) * 1000) / 10 : 0,
      attempted: v.attempted,
    }));

    const studyTimeByDay = Array.from(studyByDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([day, minutes]) => ({ day, minutes }));

    const weakChapters = byChapter
      .filter((c) => c.attempted >= 3 && c.accuracy < 40)
      .sort((a, b) => a.accuracy - b.accuracy)
      .map(({ chapter_id, chapter, subject, accuracy, attempted }) => ({
        chapter_id,
        chapter,
        subject,
        accuracy,
        attempted,
      }));

    const overallAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 1000) / 10 : 0;

    return { totalAttempted, overallAccuracy, bySubject, byChapter, studyTimeByDay, weakChapters };
  });

const reportSchema = z.object({
  session_id: z.string().uuid().nullable(),
  question_id: z.string().min(1),
  question_text: z.string().optional(),
  reason: z.string().min(1).max(80),
  message: z.string().max(1000).optional(),
});

export const reportIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("question_reports").insert({
      user_id: context.userId,
      session_id: data.session_id,
      question_id: data.question_id,
      question_text: data.question_text ?? null,
      reason: data.reason,
      message: data.message ?? null,
    });
    if (error) throw error;

    const lovableKey = process.env.LOVABLE_API_KEY;
    const telegramKey = (process.env.TELEGRAM_API_KEY_1 ?? process.env.TELEGRAM_API_KEY);
    const chatId = process.env.REPORT_TELEGRAM_CHAT_ID;
    if (lovableKey && telegramKey && chatId) {
      const text = [
        "🚩 <b>Question reported</b>",
        `User: <code>${context.userId}</code>`,
        `Session: <code>${data.session_id ?? "—"}</code>`,
        `Question: <code>${data.question_id}</code>`,
        `Reason: ${escapeHtml(data.reason)}`,
        data.message ? `Note: ${escapeHtml(data.message)}` : "",
        data.question_text ? `\n${escapeHtml(data.question_text).slice(0, 500)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      try {
        await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": telegramKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        });
      } catch (e) {
        console.error("[telegram] report send failed", e);
      }
    }
    return { ok: true };
  });

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
