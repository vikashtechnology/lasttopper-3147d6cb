import { createServerFn } from "@tanstack/react-start";
import { aiChat } from "@/lib/ai-router";
import { sendTelegramAlert } from "@/lib/telegram-alert";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Chapter = {
  id: string;
  subject_id: string;
  name: string;
  class_level: number | null;
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

const generatedQuizQuestionSchema = z.object({
  chapter: z.string().max(300),
  question: z.string().trim().min(1).max(20_000),
  options: z.object({
    A: z.string().max(10_000),
    B: z.string().max(10_000),
    C: z.string().max(10_000),
    D: z.string().max(10_000),
  }),
  correct: z.enum(["A", "B", "C", "D"]),
  hint: z.string().max(10_000).default(""),
  explanation: z.string().max(20_000).default(""),
});

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
      .in(
        "subject_id",
        (subjects ?? []).map((s) => s.id),
      )
      .order("class_level")
      .order("display_order");
    if (cErr) throw cErr;

    const catalog = new Map<string, SubjectWithChapters>();
    for (const subject of subjects ?? []) {
      const ownChapters = (chapters ?? []).filter((chapter) => chapter.subject_id === subject.id);
      const item = { ...subject, chapters: ownChapters } as SubjectWithChapters;
      const key = `${subject.profession}:${subject.name.trim().toLowerCase()}`;
      const existing = catalog.get(key);

      // Prefer the populated canonical row over a legacy empty placeholder.
      // If two populated rows ever exist, merge chapter IDs without showing a
      // duplicate user-facing subject section.
      if (!existing || (existing.chapters.length === 0 && ownChapters.length > 0)) {
        catalog.set(key, item);
      } else if (ownChapters.length > 0) {
        const chapterIds = new Set(existing.chapters.map((chapter) => chapter.id));
        catalog.set(key, {
          ...existing,
          chapters: [
            ...existing.chapters,
            ...ownChapters.filter((chapter) => !chapterIds.has(chapter.id)),
          ],
        });
      }
    }

    return Array.from(catalog.values()).filter((subject) => subject.chapters.length > 0);
  });

async function callGeminiBatch(
  chapterNames: string[],
  profession: string,
  count: number,
  batchIndex: number,
): Promise<QuizQuestion[]> {
  const subjectLabel =
    profession === "pcm" ? "JEE (Physics, Chemistry, Math)" : "NEET (Physics, Chemistry, Biology)";
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
        {
          role: "system",
          content:
            "You are an NCERT-only exam question generator. You must only use content that appears in official NCERT textbooks. Output STRICT JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
  } catch {
    throw new Error("AI_BUSY");
  }
  const content: string = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = z
      .object({ questions: z.array(generatedQuizQuestionSchema).max(100) })
      .parse(JSON.parse(content));
    return parsed.questions.slice(0, count).map((q) => ({
      id: `q_${crypto.randomUUID()}`,
      chapter_id: "",
      question: q.question,
      options: q.options,
      correct: q.correct,
      hint: q.hint,
      explanation: q.explanation,
    }));
  } catch {
    throw new Error("AI returned an invalid question batch");
  }
}

/* ---------------- Progressive (5-at-a-time) generation ---------------- */

const startProgressiveSchema = z.object({
  chapter_ids: z.array(z.string().uuid()).min(1).max(100),
  target_count: z.union([z.literal(20), z.literal(50), z.literal(100)]),
  timer_enabled: z.boolean(),
  duration_seconds: z
    .number()
    .int()
    .positive()
    .max(7 * 24 * 60 * 60)
    .nullable(),
});

const PROG_BATCH = 5;

async function generateBatchForSession(
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  userId: string,
  chapterIds: string[],
  count: number,
  batchIndex: number,
): Promise<QuizQuestion[]> {
  const { data: profile } = await supabase
    .from("users")
    .select("profession")
    .eq("id", userId)
    .maybeSingle();
  const profession = profile?.profession;
  if (!profession) throw new Error("Complete onboarding first");
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name")
    .in("id", chapterIds);
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
    } catch {
      /* non-fatal */
    }
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await context.supabase
      .from("users")
      .select("is_pro")
      .eq("id", context.userId)
      .maybeSingle();
    if (data.target_count > 20 && !profile?.is_pro) throw new Error("PRO_REQUIRED");
    {
      const { assertQuota } = await import("@/lib/quota.server");
      await assertQuota(context.supabase, context.userId, data.target_count);
    }

    const firstCount = Math.min(PROG_BATCH, data.target_count);
    let first: QuizQuestion[];
    try {
      first = await generateBatchForSession(
        supabaseAdmin,
        context.userId,
        data.chapter_ids,
        firstCount,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "AI_BUSY") throw new Error("AI is busy — please try again in a minute.");
      throw e;
    }

    const nowIso = new Date().toISOString();
    const { data: row, error } = await supabaseAdmin
      .from("quiz_sessions")
      .insert({
        user_id: context.userId,
        chapter_ids: data.chapter_ids,
        question_count: data.target_count,
        questions: first,
        xp_eligible: true,
        timer_enabled: data.timer_enabled,
        duration_seconds: data.duration_seconds,
        start_time: nowIso,
        last_heartbeat: nowIso,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string, generated: first.length, target: data.target_count };
  });

export const extendQuizSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s, error } = await supabaseAdmin
      .from("quiz_sessions")
      .select("questions, question_count, chapter_ids, submitted_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!s) throw new Error("Session not found");
    if (s.submitted_at)
      return { done: true as const, added: 0, total: (s.questions as QuizQuestion[]).length };
    const cur = (s.questions as QuizQuestion[]) ?? [];
    const target = Number(s.question_count ?? 0);
    if (cur.length >= target) return { done: true as const, added: 0, total: cur.length };

    const remaining = target - cur.length;
    const n = Math.min(PROG_BATCH, remaining);
    const batchIdx = Math.floor(cur.length / PROG_BATCH);
    const chapterIds = (s.chapter_ids as string[]) ?? [];
    const more = await generateBatchForSession(
      supabaseAdmin,
      context.userId,
      chapterIds,
      n,
      batchIdx,
    );
    const next = [...cur, ...more];
    const { error: updateError } = await supabaseAdmin
      .from("quiz_sessions")
      .update({ questions: next as unknown as never })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("submitted_at", null);
    if (updateError) throw updateError;
    return { done: next.length >= target, added: more.length, total: next.length };
  });

const quizQuestionInputSchema = z.object({
  id: z.string().min(1).max(128),
  chapter_id: z.string().max(128),
  question: z.string().min(1).max(20_000),
  options: z.object({
    A: z.string().max(10_000),
    B: z.string().max(10_000),
    C: z.string().max(10_000),
    D: z.string().max(10_000),
  }),
  correct: z.enum(["A", "B", "C", "D"]),
  hint: z.string().max(10_000),
  explanation: z.string().max(20_000),
});

const createSessionSchema = z
  .object({
    chapter_ids: z.array(z.string().uuid()).min(1).max(100),
    question_count: z.number().int().min(1).max(100),
    questions: z.array(quizQuestionInputSchema).min(1).max(100),
    timer_enabled: z.boolean(),
    duration_seconds: z
      .number()
      .int()
      .positive()
      .max(7 * 24 * 60 * 60)
      .nullable(),
  })
  .refine((value) => value.question_count === value.questions.length, "Question count mismatch");

export const createQuizSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSessionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: row, error } = await supabaseAdmin
      .from("quiz_sessions")
      .insert({
        user_id: context.userId,
        chapter_ids: data.chapter_ids,
        question_count: data.question_count,
        questions: data.questions,
        // Retry/practice papers come from previously revealed client content and
        // must never affect XP, authoritative analytics, or Mega study tasks.
        xp_eligible: false,
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("quiz_sessions")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!row || row.submitted_at) return row;
    return {
      ...row,
      questions: ((row.questions as QuizQuestion[]) ?? []).map(
        ({ correct: _correct, explanation: _explanation, ...question }) => question,
      ),
    };
  });

export const heartbeatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("quiz_sessions")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("submitted_at", null);
    if (error) throw error;
    return { ok: true };
  });

function scoreQuestions(questions: QuizQuestion[], answers: Record<string, "A" | "B" | "C" | "D">) {
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
  answers: z
    .record(z.string().max(128), z.enum(["A", "B", "C", "D"]))
    .refine((answers) => Object.keys(answers).length <= 200, "Too many answers"),
  // Retained for wire compatibility; elapsed time is derived by the database.
  time_taken_seconds: z
    .number()
    .int()
    .nonnegative()
    .max(7 * 24 * 60 * 60),
});

export const submitQuizSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: submissionData, error: submissionError } = await (supabaseAdmin as any).rpc(
      "submit_quiz_session",
      {
        p_session_id: data.id,
        p_user_id: context.userId,
        p_answers: data.answers,
        p_allow_late: false,
      },
    );
    if (submissionError) throw submissionError;
    const submission = Array.isArray(submissionData) ? submissionData[0] : submissionData;
    if (!submission) throw new Error("Quiz submission failed");

    const correct = Number(submission.correct_count ?? 0);
    const incorrect = Number(submission.incorrect_count ?? 0);
    const total = Number(submission.total ?? 0);
    const accuracy = Number(submission.accuracy ?? 0);

    if (submission.submitted) {
      // Refresh the user's rolling accuracy after the authoritative submission.
      const { data: all, error: accuracyReadError } = await supabaseAdmin
        .from("quiz_sessions")
        .select("accuracy")
        .eq("user_id", context.userId)
        .eq("xp_eligible", true)
        .not("submitted_at", "is", null);
      if (accuracyReadError) throw accuracyReadError;
      if (all.length > 0) {
        const avg = all.reduce((sum, row) => sum + Number(row.accuracy ?? 0), 0) / all.length;
        const { error: accuracyError } = await supabaseAdmin
          .from("users")
          .update({ total_accuracy: Math.round(avg * 100) / 100 })
          .eq("id", context.userId);
        if (accuracyError) throw accuracyError;
      }
    }

    return {
      correct,
      incorrect,
      total,
      accuracy,
      xp_gained: Number(submission.xp_gained ?? 0),
      xp_total: Number(submission.xp_total ?? 0),
    };
  });

// Lazy check: auto-submit any live session whose last_heartbeat is stale (>2 min).
export const finalizeStaleSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: stale, error: staleError } = await supabaseAdmin
      .from("quiz_sessions")
      .select("id, answers")
      .eq("user_id", context.userId)
      .is("submitted_at", null)
      .lt("last_heartbeat", cutoff);
    if (staleError) throw staleError;

    const finalized: string[] = [];
    for (const session of stale ?? []) {
      const { data: submissionData, error: submissionError } = await (supabaseAdmin as any).rpc(
        "submit_quiz_session",
        {
          p_session_id: session.id,
          p_user_id: context.userId,
          p_answers: session.answers ?? {},
          p_allow_late: true,
        },
      );
      if (submissionError) throw submissionError;
      const submission = Array.isArray(submissionData) ? submissionData[0] : submissionData;
      if (submission?.submitted) finalized.push(session.id as string);
    }
    return { finalized };
  });

export const getTodayUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getQuotaState } = await import("@/lib/quota.server");
    const state = await getQuotaState(context.supabase, context.userId);
    return { used: state.used, limit: state.limit, is_pro: state.is_pro };
  });

export const getQuizHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("quiz_sessions")
      .select(
        "id, question_count, correct_count, incorrect_count, accuracy, time_taken_seconds, submitted_at, was_auto_submitted, chapter_ids",
      )
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("quiz_sessions")
      .select("id, questions, answers, submitted_at")
      .eq("user_id", context.userId)
      .eq("xp_eligible", true)
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
  byChapter: Array<{
    chapter_id: string;
    chapter: string;
    subject: string;
    accuracy: number;
    attempted: number;
  }>;
  studyTimeByDay: Array<{ day: string; minutes: number }>;
  weakChapters: Array<{
    chapter_id: string;
    chapter: string;
    subject: string;
    accuracy: number;
    attempted: number;
  }>;
};

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Analytics> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from("quiz_sessions")
      .select("questions, answers, submitted_at, time_taken_seconds")
      .eq("user_id", context.userId)
      .eq("xp_eligible", true)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(200);
    if (sessionsError) throw sessionsError;

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
        studyByDay.set(
          day,
          (studyByDay.get(day) ?? 0) + Math.round((s.time_taken_seconds ?? 0) / 60),
        );
      }
    }

    const chapterIds = Array.from(chapterAgg.keys()).filter(Boolean);
    const { data: chapters } = chapterIds.length
      ? await context.supabase.from("chapters").select("id, name, subject_id").in("id", chapterIds)
      : { data: [] as Array<{ id: string; name: string; subject_id: string }> };
    const subjectIds = Array.from(new Set((chapters ?? []).map((c) => c.subject_id)));
    const { data: subjects } = subjectIds.length
      ? await context.supabase.from("subjects").select("id, name").in("id", subjectIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const subjectNameById = new Map((subjects ?? []).map((s) => [s.id, s.name] as const));
    const chapterMeta = new Map(
      (chapters ?? []).map(
        (c) => [c.id, { name: c.name, subject: subjectNameById.get(c.subject_id) ?? "—" }] as const,
      ),
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

    const overallAccuracy =
      totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 1000) / 10 : 0;

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
    await sendTelegramAlert(text);
    return { ok: true };
  });

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
