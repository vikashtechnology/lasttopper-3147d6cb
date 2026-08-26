import type { FirestoreDataClient } from "@/integrations/firebase/data.server";
import type { Database } from "@/integrations/firebase/types";
import type { QuizQuestion } from "@/lib/learning.functions";

type AnyClient = FirestoreDataClient;

/** Leitner intervals in days, indexed by box (1-5). */
export const BOX_DAYS = [1, 1, 3, 7, 16, 35];

export function questionKey(q: QuizQuestion): string {
  return (q.question ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 180);
}

/** Add mistakes to the spaced-repetition queue (never overwrites existing progress). */
export async function upsertReviewItems(
  client: AnyClient,
  userId: string,
  questions: QuizQuestion[],
): Promise<number> {
  const seen = new Set<string>();
  const rows = questions
    .filter((q) => q?.question)
    .map((q) => ({ key: questionKey(q), q }))
    .filter(({ key }) => {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ key, q }) => ({
      user_id: userId,
      question_key: key,
      chapter_id: q.chapter_id || null,
      question: q as unknown as never,
      box: 1,
      due_at: new Date().toISOString(),
    }));
  if (!rows.length) return 0;
  const { error } = await client.from("review_items").upsert(rows as unknown as never, {
    onConflict: "user_id,question_key",
    ignoreDuplicates: true,
  });
  if (error) throw error;
  return rows.length;
}
