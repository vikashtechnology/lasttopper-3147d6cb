import { createServerFn } from "@tanstack/react-start";
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

async function callGeminiForQuestions(
  chapterNames: string[],
  profession: string,
  count: number,
): Promise<QuizQuestion[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const subjectLabel = profession === "pcm" ? "JEE (Physics, Chemistry, Math)" : "NEET (Physics, Chemistry, Biology)";
  const prompt = `Generate exactly ${count} exam-style multiple-choice questions for ${subjectLabel}, distributed across these chapters: ${chapterNames.join(", ")}.

Rules:
- Cover a mix of easy, medium, and hard difficulty.
- Use LaTeX for all math/formulas, wrapped in single $...$ for inline and $$...$$ for display.
- 4 options labeled A, B, C, D — exactly one correct.
- Provide a short hint (1 sentence) and a clear step-by-step explanation.
- Return STRICT JSON only, no markdown, matching this schema:
{"questions":[{"chapter":"<chapter name>","question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"A|B|C|D","hint":"...","explanation":"..."}]}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: "You are an expert exam question generator. Output STRICT JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 429 || resp.status === 402) {
      throw new Error("AI_BUSY");
    }
    throw new Error(`AI gateway error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { questions?: Array<Omit<QuizQuestion, "id" | "chapter_id"> & { chapter: string }> } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  const raw = parsed.questions ?? [];
  return raw.slice(0, count).map((q, i) => ({
    id: `q_${Date.now()}_${i}`,
    chapter_id: "",
    question: q.question,
    options: q.options,
    correct: q.correct,
    hint: q.hint,
    explanation: q.explanation,
  }));
}

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("users")
      .select("profession")
      .eq("id", context.userId)
      .maybeSingle();
    const profession = profile?.profession;
    if (!profession) throw new Error("Complete onboarding first");

    // Cache lookup: same chapters + count within 24h
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
      if (msg === "AI_BUSY") {
        return { questions: [] as QuizQuestion[], cached: false, error: "AI is busy — please try again in a minute." as const };
      }
      throw e;
    }

    // Round-robin assign chapter_ids to each question
    questions = questions.map((q, i) => ({
      ...q,
      chapter_id: data.chapter_ids[i % data.chapter_ids.length],
    }));

    await context.supabase.from("generated_questions").insert({
      user_id: context.userId,
      chapter_ids: data.chapter_ids,
      profession,
      question_count: data.question_count,
      questions: questions as unknown as object,
    });

    return { questions, cached: false };
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
    const { data: row, error } = await context.supabase
      .from("quiz_sessions")
      .insert({
        user_id: context.userId,
        chapter_ids: data.chapter_ids,
        question_count: data.question_count,
        questions: data.questions,
        timer_enabled: data.timer_enabled,
        duration_seconds: data.duration_seconds,
        start_time: new Date().toISOString(),
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
      .select("questions, user_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!session) throw new Error("Session not found");

    const questions = session.questions as QuizQuestion[];
    let correct = 0;
    for (const q of questions) {
      if (data.answers[q.id] && data.answers[q.id] === q.correct) correct += 1;
    }
    const total = questions.length;
    const incorrect = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;

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

    return { correct, incorrect, total, accuracy };
  });
