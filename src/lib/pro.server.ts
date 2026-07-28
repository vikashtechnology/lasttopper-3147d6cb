type Sb = { from: (t: string) => any };

/** Weakest chapters (lowest accuracy) for a user, derived from submitted quizzes. */
export async function getAnalyticsFor(
  supabase: Sb,
  userId: string,
): Promise<{ chapter: string; accuracy: number }[]> {
  const { data: sessions } = await supabase
    .from("quiz_sessions")
    .select("questions, answers")
    .eq("user_id", userId)
    .not("submitted_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);

  const agg = new Map<string, { correct: number; total: number }>();
  for (const s of sessions ?? []) {
    const questions = (s.questions ?? []) as {
      id: string;
      correct: string;
      chapter?: string | null;
    }[];
    const answers = (s.answers ?? {}) as Record<string, string>;
    for (const q of questions) {
      if (!answers[q.id]) continue;
      const key = q.chapter ?? "General";
      const cur = agg.get(key) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (answers[q.id] === q.correct) cur.correct += 1;
      agg.set(key, cur);
    }
  }

  return [...agg.entries()]
    .filter(([, v]) => v.total >= 3)
    .map(([chapter, v]) => ({ chapter, accuracy: (v.correct / v.total) * 100 }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);
}
