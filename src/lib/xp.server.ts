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
    .select("reputation")
    .eq("id", userId)
    .maybeSingle();

  const current = Number(row?.reputation ?? 0);
  const gained = xpForCorrect(current, correctCount);
  const next = current + gained;

  await client.from("users").update({ reputation: next }).eq("id", userId);

  const beforeTier = tierForXp(current);
  const afterTier = tierForXp(next);
  return { gained, xp: next, tierUp: beforeTier.key !== afterTier.key, tier: afterTier.key };
}
