import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

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
  db: import("@/integrations/firebase/data.server").FirestoreDataClient;
  userId: string;
}) {
  const { data, error } = await ctx.db.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
}

/** Promo redemption is disabled so Pro passes always use fixed published prices. */
export const checkPromoCode = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().trim().min(2).max(32), plan: planEnum }).parse(d),
  )
  .handler(async () => ({ valid: false as const, percent: 0 }));

export const adminListPromoCodes = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    const { data, error } = await firestoreAdmin
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
  .middleware([requireFirebaseAuth])
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
  .handler(async ({ context }) => {
    await assertAdmin(context);
    throw new Error("Promo codes are disabled; Pro passes use fixed prices");
  });

export const adminDeletePromoCode = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context }) => {
    await assertAdmin(context);
    throw new Error("Promo codes are disabled; Pro passes use fixed prices");
  });
