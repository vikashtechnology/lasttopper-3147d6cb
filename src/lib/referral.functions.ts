import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.db
      .from("users")
      .select("referral_code, referred_by")
      .eq("id", context.userId)
      .maybeSingle();

    const { count } = await context.db
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", context.userId);

    const { count: paidCount } = await context.db
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", context.userId)
      .eq("referral_credited", true);

    const converted = paidCount ?? 0;
    const MILESTONE = 10;

    return {
      code: (me?.referral_code as string | null) ?? null,
      referred_by: (me?.referred_by as string | null) ?? null,
      invited: count ?? 0,
      converted,
      milestone_size: MILESTONE,
      milestone_reward_days: 7,
      milestones_earned: Math.floor(converted / MILESTONE),
      to_next_milestone: MILESTONE - (converted % MILESTONE),
    };
  });

/** Pro discount vouchers earned by this user (referral rewards). */
export const getMyVouchers = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.db
      .from("pro_vouchers")
      .select("id, code, percent, used_at, expires_at, note")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    const now = Date.now();
    const rows = data ?? [];
    return {
      vouchers: rows,
      best:
        rows
          .filter((v) => !v.used_at && new Date(v.expires_at as string).getTime() > now)
          .sort((a, b) => b.percent - a.percent)[0] ?? null,
    };
  });

const applySchema = z.object({ code: z.string().trim().min(4).max(16) });

export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => applySchema.parse(d))
  .handler(async ({ data, context }) => {
    const code = data.code.trim().toUpperCase();

    const { data: me } = await context.db
      .from("users")
      .select("referred_by, referral_code")
      .eq("id", context.userId)
      .maybeSingle();
    if (me?.referred_by) return { ok: false as const, error: "Referral already applied" };
    if (me?.referral_code?.toUpperCase() === code)
      return { ok: false as const, error: "You can't use your own code" };

    // RLS restricts the users table to the owner's row, so look up the
    // referrer with the admin client (read-only, id only).
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    const { data: ref } = await firestoreAdmin
      .from("users")
      .select("id")
      .ilike("referral_code", code)
      .maybeSingle();
    if (!ref || ref.id === context.userId)
      return { ok: false as const, error: "Invalid referral code" };

    const { error } = await firestoreAdmin
      .from("users")
      .update({ referred_by: ref.id })
      .eq("id", context.userId)
      .is("referred_by", null);
    if (error) return { ok: false as const, error: "Could not apply referral code" };
    return { ok: true as const };
  });
