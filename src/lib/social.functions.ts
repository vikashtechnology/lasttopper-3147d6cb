import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SocialLink = {
  id: string;
  platform: string;
  label: string;
  url: string;
  enabled: boolean;
  display_order: number;
};

/** Enabled links only — used by the sidebar dropdown and profile footer. */
export const listSocialLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("social_links")
      .select("id, platform, label, url, enabled, display_order")
      .eq("enabled", true)
      .order("display_order", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as SocialLink[]).filter((l) => !!l.url?.trim());
  });

async function assertAdmin(ctx: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
}

/** All links (including hidden ones) for the admin console. */
export const adminListSocialLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("social_links")
      .select("id, platform, label, url, enabled, display_order")
      .order("display_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as SocialLink[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  platform: z.string().trim().min(2).max(30).regex(/^[a-z0-9_-]+$/i),
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().max(300),
  enabled: z.boolean(),
  display_order: z.number().int().min(0).max(999),
});

export const adminSaveSocialLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const url = data.url.trim();
    if (url && !/^https?:\/\//i.test(url)) throw new Error("Link must start with http:// or https://");
    if (data.enabled && !url) throw new Error("Add a link before enabling it.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      platform: data.platform.toLowerCase(),
      label: data.label,
      url,
      enabled: data.enabled,
      display_order: data.display_order,
    };
    const { error } = data.id
      ? await (supabaseAdmin as any).from("social_links").update(row).eq("id", data.id)
      : await (supabaseAdmin as any).from("social_links").insert(row);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteSocialLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("social_links").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
