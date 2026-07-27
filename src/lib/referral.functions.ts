import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.supabase
      .from("users")
      .select("referral_code, referred_by, mega_credits")
      .eq("id", context.userId)
      .maybeSingle();

    const { count } = await context.supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", context.userId);

    const { count: paidCount } = await context.supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", context.userId)
      .eq("referral_credited", true);

    return {
      code: (me?.referral_code as string | null) ?? null,
      referred_by: (me?.referred_by as string | null) ?? null,
      mega_credits: Number(me?.mega_credits ?? 0),
      invited: count ?? 0,
      converted: paidCount ?? 0,
    };
  });

const applySchema = z.object({ code: z.string().trim().min(4).max(16) });

export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applySchema.parse(d))
  .handler(async ({ data, context }) => {
    const code = data.code.trim().toUpperCase();

    const { data: me } = await context.supabase
      .from("users")
      .select("referred_by, referral_code")
      .eq("id", context.userId)
      .maybeSingle();
    if (me?.referred_by) return { ok: false as const, error: "Referral already applied" };
    if (me?.referral_code?.toUpperCase() === code)
      return { ok: false as const, error: "You can't use your own code" };

    // RLS restricts the users table to the owner's row, so look up the
    // referrer with the admin client (read-only, id only).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ref } = await supabaseAdmin
      .from("users")
      .select("id")
      .ilike("referral_code", code)
      .maybeSingle();
    if (!ref || ref.id === context.userId)
      return { ok: false as const, error: "Invalid referral code" };

    const { error } = await context.supabase
      .from("users")
      .update({ referred_by: ref.id })
      .eq("id", context.userId);
    if (error) return { ok: false as const, error: "Could not apply referral code" };
    return { ok: true as const };
  });

