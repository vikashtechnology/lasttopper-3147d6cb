import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AnyClient = SupabaseClient<Database>;

export type QuestionXpSource = {
  type: "battle" | "daily_challenge" | "quiz_session" | "review";
  id: string;
  version?: number;
};

/**
 * Atomically award XP for correctly solved questions. The database locks the
 * user row and deduplicates the server-owned source identity, so concurrent or
 * replayed requests cannot lose or duplicate XP.
 */
export async function awardQuestionXp(
  client: AnyClient,
  userId: string,
  correctCount: number,
  source: QuestionXpSource,
) {
  if (!Number.isInteger(correctCount) || correctCount < 0 || correctCount > 200) {
    throw new Error("Invalid correct answer count");
  }

  const { data, error } = await (client as any).rpc("award_question_xp", {
    p_user_id: userId,
    p_correct_count: correctCount,
    p_source_type: source.type,
    p_source_id: source.id,
    p_source_version: source.version ?? 1,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("XP award failed");

  return {
    gained: Number(result.gained ?? 0),
    xp: Number(result.xp ?? 0),
    boost: Number(result.boost ?? 1),
    tierUp: !!result.tier_up,
    tier: String(result.tier ?? "bronze"),
    awarded: !!result.awarded,
  };
}
