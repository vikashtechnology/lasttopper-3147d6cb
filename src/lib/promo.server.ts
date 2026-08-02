/**
 * Admin-created promo codes for Pro subscriptions.
 *
 * A promo code has: code, discount percent, allowed plans, expiry (validation),
 * optional max uses, and an active flag. Each user can redeem a code once.
 */

export type ProPlanKey = "pro_weekly" | "pro" | "pro_yearly";

export type PromoRow = {
  id: string;
  code: string;
  percent: number;
  plans: string[];
  valid_until: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
};

/** Returns the promo if it is valid for `plan` and unused by `userId`, else null. */
export async function findValidPromo(
  code: string,
  plan: ProPlanKey,
  userId: string,
): Promise<PromoRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("promo_codes")
    .select("id, code, percent, plans, valid_until, max_uses, used_count, is_active")
    .ilike("code", code.trim())
    .maybeSingle();
  const promo = data as PromoRow | null;
  if (!promo || !promo.is_active) return null;
  if (!promo.plans?.includes(plan)) return null;
  if (promo.valid_until && new Date(promo.valid_until).getTime() < Date.now()) return null;
  if (promo.max_uses != null && promo.used_count >= promo.max_uses) return null;

  const { data: used } = await supabaseAdmin
    .from("promo_code_redemptions")
    .select("id")
    .eq("promo_code_id", promo.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (used) return null;
  return promo;
}

/** Records a redemption and bumps the usage counter (idempotent per user+code). */
export async function redeemPromo(promo: PromoRow, userId: string, plan: ProPlanKey) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("promo_code_redemptions").insert({
    promo_code_id: promo.id,
    user_id: userId,
    plan,
    percent: promo.percent,
  });
  if (error) return; // already redeemed
  await supabaseAdmin
    .from("promo_codes")
    .update({ used_count: promo.used_count + 1 })
    .eq("id", promo.id);
}
