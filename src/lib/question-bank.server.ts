import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { QuizQuestion } from "@/lib/learning.functions";

type AdminClient = SupabaseClient<Database>;

/**
 * Persist AI-generated questions into the fallback bank. Best-effort:
 * failures never break the caller (bank is only used when AI is down).
 */
export async function saveToBank(
  admin: AdminClient,
  profession: string | null,
  questions: QuizQuestion[],
  chapterId?: string | null,
): Promise<void> {
  if (!questions?.length) return;
  const rows = questions
    .filter((q) => q && q.question && q.options && q.correct)
    .map((q) => ({
      profession,
      chapter_id: chapterId ?? q.chapter_id ?? null,
      question: q.question,
      options: q.options as unknown as never,
      correct: q.correct,
      hint: q.hint ?? "",
      explanation: q.explanation ?? "",
      source: "ai",
    }));
  if (!rows.length) return;
  try {
    await admin.from("question_bank").insert(rows as unknown as never);
  } catch {
    /* swallow: bank is a nice-to-have */
  }
}

/**
 * Sample `count` questions from the bank as a fallback when AI fails.
 * Filters by profession + optional chapter set. Returns [] if bank is empty.
 */
export async function sampleFromBank(
  admin: AdminClient,
  profession: string | null,
  count: number,
  chapterIds?: string[],
): Promise<QuizQuestion[]> {
  let q = admin
    .from("question_bank")
    .select("id, chapter_id, question, options, correct, hint, explanation");
  if (profession) q = q.or(`profession.eq.${profession},profession.is.null`);
  if (chapterIds?.length) q = q.in("chapter_id", chapterIds);
  // pull a larger pool then shuffle, so different sessions see different questions
  const { data } = await q.limit(Math.max(count * 4, 40));
  const pool = data ?? [];
  if (pool.length === 0) return [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
  return shuffled.map((r, i) => ({
    id: `bank_${Date.now()}_${i}`,
    chapter_id: (r.chapter_id as string) ?? "",
    question: r.question as string,
    options: r.options as QuizQuestion["options"],
    correct: r.correct as QuizQuestion["correct"],
    hint: (r.hint as string) ?? "",
    explanation: (r.explanation as string) ?? "",
  }));
}
