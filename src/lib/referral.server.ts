/**
 * Referral milestones.
 *
 * Every 10 converted referrals (friend signed up with your code AND made a
 * first wallet top-up) grants the referrer 1 free week of Pro.
 */

export const MILESTONE_SIZE = 10;
export const MILESTONE_REWARD_DAYS = 7;

/**
 * Grants 1 week of Pro for each newly reached 10-referral milestone.
 * Idempotent: past grants are ledgered in `activity_events`.
 */
export async function maybeGrantReferralMilestone(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { count: converted } = await supabaseAdmin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("referred_by", userId)
    .eq("referral_credited", true);

  const earned = Math.floor((converted ?? 0) / MILESTONE_SIZE);
  if (earned <= 0) return null;

  const { count: granted } = await supabaseAdmin
    .from("activity_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "referral_milestone");

  const pending = earned - (granted ?? 0);
  if (pending <= 0) return null;

  const { data: me } = await supabaseAdmin
    .from("users")
    .select("pro_until, is_pro, pro_since")
    .eq("id", userId)
    .maybeSingle();

  const now = Date.now();
  const current = me?.pro_until ? new Date(me.pro_until as string).getTime() : 0;
  const base = Math.max(now, current);
  const until = new Date(base + pending * MILESTONE_REWARD_DAYS * 24 * 60 * 60 * 1000);

  await supabaseAdmin
    .from("users")
    .update({
      is_pro: true,
      pro_until: until.toISOString(),
      pro_since: (me?.pro_since as string | null) ?? new Date().toISOString(),
    })
    .eq("id", userId);

  for (let i = 0; i < pending; i += 1) {
    await supabaseAdmin.from("activity_events").insert({
      user_id: userId,
      kind: "referral_milestone",
      payload: { milestone: (granted ?? 0) + i + 1, days: MILESTONE_REWARD_DAYS },
    });
  }

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    kind: "referral",
    title: `🏆 ${pending * MILESTONE_REWARD_DAYS} days of Pro unlocked!`,
    body: `You hit ${earned * MILESTONE_SIZE} referrals. Pro is active until ${until.toLocaleDateString()}.`,
    link: "/pricing",
  });

  return { days: pending * MILESTONE_REWARD_DAYS, pro_until: until.toISOString() };
}
