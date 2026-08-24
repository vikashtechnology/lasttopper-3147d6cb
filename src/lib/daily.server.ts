import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { QuizQuestion } from "@/lib/learning.functions";
import { aiChat } from "@/lib/ai-router";

type AnyClient = SupabaseClient<Database>;

export const DAILY_COUNT = 10;

export function todayKey(): string {
  // IST day boundary
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function rewardFor(correct: number): number {
  if (correct >= 8) return 10;
  if (correct >= 5) return 5;
  return 2;
}

async function aiDailyQuestions(
  profession: string,
  chapterNames: string[],
): Promise<QuizQuestion[]> {
  const label =
    profession === "pcm" ? "JEE (Physics, Chemistry, Math)" : "NEET (Physics, Chemistry, Biology)";
  const prompt = `Generate exactly ${DAILY_COUNT} NCERT-only multiple-choice questions for ${label}, mixed across these chapters: ${chapterNames.join(", ")}.

Rules:
- Ground every question, option, hint and explanation strictly in official NCERT Class 11 & 12 content.
- Mixed difficulty (3 easy, 4 medium, 3 hard).
- LaTeX for math: $...$ inline, $$...$$ display.
- 4 options A-D, exactly one correct.
- Return STRICT JSON only:
{"questions":[{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"A|B|C|D","hint":"...","explanation":"..."}]}`;

  const data = await aiChat({
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "system",
        content: "You are an NCERT-only exam question generator. Output STRICT JSON only.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });
  const content: string = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as {
    questions?: Array<Omit<QuizQuestion, "id" | "chapter_id">>;
  };
  return (parsed.questions ?? []).slice(0, DAILY_COUNT).map((q, i) => ({
    id: `daily_${Date.now()}_${i}`,
    chapter_id: "",
    question: q.question,
    options: q.options,
    correct: q.correct,
    hint: q.hint ?? "",
    explanation: q.explanation ?? "",
  }));
}

/** Get (or lazily create) today's shared challenge for a profession. */
export async function ensureDailyChallenge(
  reader: AnyClient,
  admin: AnyClient,
  profession: "pcm" | "pcb",
): Promise<{ id: string; questions: QuizQuestion[] }> {
  const date = todayKey();
  const { data: existing } = await reader
    .from("daily_challenges")
    .select("id, questions")
    .eq("challenge_date", date)
    .eq("profession", profession)
    .maybeSingle();
  if (existing)
    return { id: existing.id as string, questions: (existing.questions as QuizQuestion[]) ?? [] };

  const { data: subjects } = await reader
    .from("subjects")
    .select("id")
    .eq("profession", profession);
  const { data: chapters } = await reader
    .from("chapters")
    .select("id, name")
    .in(
      "subject_id",
      (subjects ?? []).map((s) => s.id),
    )
    .limit(400);
  const pool = chapters ?? [];
  const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);

  let questions: QuizQuestion[] = [];
  try {
    questions = await aiDailyQuestions(
      profession,
      picked.map((c) => c.name),
    );
  } catch {
    questions = [];
  }
  if (questions.length < 5) {
    const { sampleFromBank } = await import("@/lib/question-bank.server");
    const bank = await sampleFromBank(admin, profession, DAILY_COUNT);
    if (bank.length >= 5) questions = bank;
  }
  if (questions.length === 0)
    throw new Error("Daily challenge unavailable right now — try again shortly.");

  questions = questions.map((q, i) => ({
    ...q,
    chapter_id: q.chapter_id || (picked[i % Math.max(1, picked.length)]?.id ?? ""),
  }));

  const { data: row, error } = await admin
    .from("daily_challenges")
    .insert({ challenge_date: date, profession, questions: questions as unknown as never })
    .select("id, questions")
    .single();
  if (error) {
    // Someone else created it concurrently — read it back.
    const { data: again } = await reader
      .from("daily_challenges")
      .select("id, questions")
      .eq("challenge_date", date)
      .eq("profession", profession)
      .maybeSingle();
    if (again)
      return { id: again.id as string, questions: (again.questions as QuizQuestion[]) ?? [] };
    throw error;
  }
  return { id: row.id as string, questions: (row.questions as QuizQuestion[]) ?? [] };
}

export async function creditCoins(
  admin: AnyClient,
  userId: string,
  amount: number,
  category: string,
  note: string,
  referenceId?: string | null,
): Promise<number> {
  const { data: u } = await admin.from("users").select("balance").eq("id", userId).maybeSingle();
  const next = Number(u?.balance ?? 0) + amount;
  await admin.from("users").update({ balance: next }).eq("id", userId);
  await admin.from("wallet_transactions").insert({
    user_id: userId,
    type: "credit",
    category,
    amount,
    balance_after: next,
    note,
    reference_id: referenceId ?? null,
  });
  return next;
}
