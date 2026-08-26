import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

export type AppRelease = {
  id: string;
  version: string;
  version_code: number;
  download_url: string;
  notes: string | null;
  mandatory: boolean;
  is_active: boolean;
  created_at: string;
};

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

/** Newest active release — drives the in-app "update available" popup. */
export const getLatestRelease = createServerFn({ method: "GET" }).handler(async () => {
  const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
  const { data, error } = await firestoreAdmin
    .from("app_releases")
    .select("id, version, version_code, download_url, notes, mandatory, is_active, created_at")
    .eq("is_active", true)
    .order("version_code", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as AppRelease | null;
});

export const adminListReleases = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    const { data, error } = await (firestoreAdmin as any)
      .from("app_releases")
      .select("id, version, version_code, download_url, notes, mandatory, is_active, created_at")
      .order("version_code", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as AppRelease[];
  });

const releaseSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.string().trim().min(1).max(20),
  version_code: z.number().int().min(1).max(1_000_000),
  download_url: z.string().trim().min(4).max(500),
  notes: z.string().trim().max(1000).optional().default(""),
  mandatory: z.boolean(),
  is_active: z.boolean(),
});

export const adminSaveRelease = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => releaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!/^https?:\/\//i.test(data.download_url))
      throw new Error("Download link must start with http:// or https://");
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    const row = {
      version: data.version,
      version_code: data.version_code,
      download_url: data.download_url,
      notes: data.notes || null,
      mandatory: data.mandatory,
      is_active: data.is_active,
      created_by: context.userId,
    };
    const { error } = data.id
      ? await (firestoreAdmin as any).from("app_releases").update(row).eq("id", data.id)
      : await (firestoreAdmin as any).from("app_releases").insert(row);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteRelease = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    const { error } = await (firestoreAdmin as any).from("app_releases").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
