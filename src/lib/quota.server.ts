/**
 * Shared daily question quota.
 *
 * Free users get `users.daily_question_limit` (default 20) attempted questions
 * per day across ALL practice sections — Learning, Daily Challenge, Review
 * (spaced repetition), Mistake practice, Flashcards quizzes, etc.
 *
 * Excluded from the quota (always unlimited):
 *   - Battle arena (quick battle / 1v1 / mega test)
 *   - Past Year Questions (session question ids are prefixed `pyq_`)
 *
 * Pro users are never limited.
 */

type Sb = { from: (t: string) => any };

export const DEFAULT_DAILY_LIMIT = 20;

export class DailyLimitError extends Error {
  constructor(
    public used: number,
    public limit: number,
  ) {
    super("DAILY_LIMIT");
    this.name = "DailyLimitError";
  }
}

function startOfTodayIso(): string {
  const dayKey = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(`${dayKey}T00:00:00+05:30`).toISOString();
}

export type QuotaState = {
  used: number;
  limit: number;
  remaining: number;
  is_pro: boolean;
};

/** Counts every question the user actually attempted today (PYQ + battles excluded). */
export async function getQuotaState(_supabase: Sb, userId: string): Promise<QuotaState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabase = supabaseAdmin;
  const start = startOfTodayIso();

  const [profileResult, sessionsResult, dailyResult, reviewsResult] = await Promise.all([
    supabase.from("users").select("is_pro, daily_question_limit").eq("id", userId).maybeSingle(),
    supabase.from("quiz_sessions").select("answers").eq("user_id", userId).gte("created_at", start),
    supabase
      .from("daily_challenge_attempts")
      .select("total_count")
      .eq("user_id", userId)
      .gte("created_at", start),
    supabase
      .from("review_items")
      .select("id")
      .eq("user_id", userId)
      .gte("updated_at", start)
      .not("last_result", "is", null),
  ]);
  const firstError =
    profileResult.error ?? sessionsResult.error ?? dailyResult.error ?? reviewsResult.error;
  if (firstError) throw firstError;
  const profile = profileResult.data;
  const sessions = sessionsResult.data;
  const daily = dailyResult.data;
  const reviews = reviewsResult.data;

  let used = 0;
  for (const row of sessions ?? []) {
    const ans = (row.answers ?? {}) as Record<string, unknown>;
    // PYQ question ids are prefixed `pyq_` — those don't burn the daily quota.
    used += Object.keys(ans).filter((k) => !k.startsWith("pyq_")).length;
  }
  for (const row of daily ?? []) used += Number(row.total_count ?? 0);
  used += (reviews ?? []).length;

  const limit = Number(profile?.daily_question_limit ?? DEFAULT_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT;
  const is_pro = !!profile?.is_pro;
  return {
    used,
    limit,
    is_pro,
    remaining: is_pro ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used),
  };
}

/** Throws `DailyLimitError` when the user can't attempt `need` more questions today. */
export async function assertQuota(supabase: Sb, userId: string, need: number): Promise<QuotaState> {
  const state = await getQuotaState(supabase, userId);
  if (state.is_pro) return state;
  if (state.used + need > state.limit) throw new DailyLimitError(state.used, state.limit);
  return state;
}
