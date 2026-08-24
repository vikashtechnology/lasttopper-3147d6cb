import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminPromo = {
  id: string;
  code: string;
  percent: number;
  plans: string[];
  valid_until: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
};

const planEnum = z.enum(["pro_weekly", "pro", "pro_yearly"]);

async function assertAdmin(ctx: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
}) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
}

/** Check a promo code for the signed-in user + plan. Returns percent off (0 if invalid). */
export const checkPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().trim().min(2).max(32), plan: planEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { findValidPromo } = await import("@/lib/promo.server");
    const promo = await findValidPromo(data.code, data.plan, context.userId);
    if (!promo) return { valid: false as const, percent: 0 };
    return { valid: true as const, percent: promo.percent, code: promo.code };
  });

export const adminListPromoCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("promo_codes")
      .select(
        "id, code, percent, plans, valid_until, max_uses, used_count, is_active, note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as AdminPromo[];
  });

export const adminSavePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        code: z.string().trim().min(2).max(32),
        percent: z.number().int().min(1).max(100),
        plans: z.array(planEnum).min(1),
        valid_until: z.string().nullable().optional(),
        max_uses: z.number().int().min(1).nullable().optional(),
        is_active: z.boolean(),
        note: z.string().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      code: data.code.toUpperCase(),
      percent: data.percent,
      plans: data.plans,
      valid_until: data.valid_until ? new Date(data.valid_until).toISOString() : null,
      max_uses: data.max_uses ?? null,
      is_active: data.is_active,
      note: data.note ?? null,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("promo_codes").update(row).eq("id", data.id);
      if (error) throw error;
      return { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("promo_codes")
      .insert({ ...row, created_by: context.userId });
    if (error) throw error;
    return { ok: true };
  });

export const adminDeletePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("promo_codes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
