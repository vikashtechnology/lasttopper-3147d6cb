/**
 * Pro discount vouchers.
 *
 * Referrals reward the referrer with a one-time Pro discount voucher
 * (15%–25% off any Pro plan) instead of Topper Coins.
 */

export const VOUCHER_MIN_PERCENT = 15;
export const VOUCHER_MAX_PERCENT = 25;

function randomPercent(): number {
  return (
    VOUCHER_MIN_PERCENT +
    Math.floor(Math.random() * (VOUCHER_MAX_PERCENT - VOUCHER_MIN_PERCENT + 1))
  );
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `PRO${out}`;
}

/** Issue a referral discount voucher to `userId`. Returns the voucher or null. */
export async function awardReferralVoucher(userId: string, note?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const percent = randomPercent();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from("pro_vouchers")
      .insert({
        user_id: userId,
        code: randomCode(),
        percent,
        source: "referral",
        note: note ?? "Referral reward — discount on any Pro plan",
      })
      .select("id, code, percent, expires_at")
      .maybeSingle();
    if (!error && data) return data;
  }
  return null;
}

/** Look up a redeemable voucher belonging to `userId`. */
export async function findRedeemableVoucher(userId: string, code: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("pro_vouchers")
    .select("id, code, percent, used_at, expires_at")
    .eq("user_id", userId)
    .ilike("code", code.trim())
    .maybeSingle();
  if (!data) return null;
  if (data.used_at) return null;
  if (data.expires_at && new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return data;
}

/** Mark a voucher as redeemed (no-op if already used). */
export async function consumeVoucher(voucherId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("pro_vouchers")
    .update({ used_at: new Date().toISOString() })
    .eq("id", voucherId)
    .is("used_at", null);
}
