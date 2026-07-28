import { xpForCorrect, tierForXp } from "@/lib/xp";

type AnyClient = {
  from: (table: string) => any;
};

/**
 * Award XP for correctly solved questions.
 * 10 XP per correct answer at Bronze, doubling with each rank crossed.
 */
export async function awardQuestionXp(
  client: AnyClient,
  userId: string,
  correctCount: number,
) {
  if (!correctCount || correctCount <= 0) return { gained: 0, xp: 0, tierUp: false };

  const { data: row } = await client
    .from("users")
    .select("reputation, is_pro")
    .eq("id", userId)
    .maybeSingle();

  const { PRO_XP_MULTIPLIER } = await import("@/lib/pro");
  const current = Number(row?.reputation ?? 0);
  const boost = row?.is_pro ? PRO_XP_MULTIPLIER : 1;
  const gained = xpForCorrect(current, correctCount, boost);
  const next = current + gained;

  await client.from("users").update({ reputation: next }).eq("id", userId);

  const beforeTier = tierForXp(current);
  const afterTier = tierForXp(next);
  return { gained, xp: next, boost, tierUp: beforeTier.key !== afterTier.key, tier: afterTier.key };
}
