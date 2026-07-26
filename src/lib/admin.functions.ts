import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTelegramAlert } from "@/lib/telegram-alert";

async function assertAdmin(ctx: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
}

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { admin: !!data };
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [users, posts, doubts, reports, withdrawals, battles] = await Promise.all([
      context.supabase.from("users").select("id", { count: "exact", head: true }),
      context.supabase.from("forum_posts").select("id", { count: "exact", head: true }),
      context.supabase.from("doubts").select("id", { count: "exact", head: true }),
      context.supabase.from("post_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
      context.supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      context.supabase.from("battle_sessions").select("id", { count: "exact", head: true }).not("submitted_at", "is", null),
    ]);
    return {
      users: users.count ?? 0,
      posts: posts.count ?? 0,
      doubts: doubts.count ?? 0,
      pending_reports: reports.count ?? 0,
      pending_withdrawals: withdrawals.count ?? 0,
      completed_battles: battles.count ?? 0,
    };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase.from("users")
      .select("id, email, full_name, phone, profession, is_banned, balance, reputation, streak, created_at, is_pro, pro_until")
      .order("created_at", { ascending: false }).limit(100);
    if (data.q) q = q.or(`email.ilike.%${data.q}%,full_name.ilike.%${data.q}%,phone.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const adminGrantPro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      plan: z.enum(["weekly", "monthly", "yearly", "revoke"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.plan === "revoke") {
      const { error } = await context.supabase.from("users")
        .update({ is_pro: false, pro_until: null }).eq("id", data.user_id);
      if (error) throw error;
      return { ok: true };
    }
    const days = data.plan === "yearly" ? 365 : data.plan === "monthly" ? 30 : 7;
    const { data: u } = await context.supabase
      .from("users").select("pro_until").eq("id", data.user_id).maybeSingle();
    const base = u?.pro_until && new Date(u.pro_until as string).getTime() > Date.now()
      ? new Date(u.pro_until as string).getTime()
      : Date.now();
    const until = new Date(base + days * 86400_000).toISOString();
    const { error } = await context.supabase.from("users")
      .update({ is_pro: true, pro_since: new Date().toISOString(), pro_until: until })
      .eq("id", data.user_id);
    if (error) throw error;
    return { ok: true, pro_until: until };
  });

export const adminSetBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), banned: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("users")
      .update({ is_banned: data.banned }).eq("id", data.user_id);
    if (error) throw error;
    return { ok: true };
  });

export const adminListReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.from("post_reports")
      .select("id, target_type, target_id, reason, message, status, created_at, reporter_id")
      .eq("status", "pending").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      report_id: z.string().uuid(),
      action: z.enum(["dismiss", "delete_content"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: report, error } = await context.supabase.from("post_reports")
      .select("target_type, target_id").eq("id", data.report_id).maybeSingle();
    if (error) throw error;
    if (!report) throw new Error("report not found");
    if (data.action === "delete_content") {
      const table = report.target_type === "forum_post" ? "forum_posts"
        : report.target_type === "forum_reply" ? "forum_replies"
        : report.target_type === "doubt" ? "doubts" : "doubt_replies";
      await context.supabase.from(table).delete().eq("id", report.target_id);
    }
    await context.supabase.from("post_reports")
      .update({ status: data.action === "delete_content" ? "resolved" : "dismissed" })
      .eq("id", data.report_id);
    return { ok: true };
  });

export const adminListWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.from("withdrawal_requests")
      .select("id, user_id, amount, method, upi_id, account_name, account_number, ifsc, status, process_after, created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const adminSetWithdrawalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      withdrawal_id: z.string().uuid(),
      status: z.enum(["processed", "rejected"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("withdrawal_requests")
      .update({ status: data.status, processed_at: new Date().toISOString() })
      .eq("id", data.withdrawal_id);
    if (error) throw error;
    await sendTelegramAlert(`💼 Withdrawal ${data.status} by admin\nID: ${data.withdrawal_id}`);
    return { ok: true };
  });

export const adminReportsChart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // Signups per day, last 14 days
    const { data: users } = await context.supabase.from("users")
      .select("created_at").gte("created_at", new Date(Date.now() - 14 * 86400e3).toISOString());
    const byDay: Record<string, number> = {};
    for (const u of users ?? []) {
      const d = (u.created_at as string).slice(0, 10);
      byDay[d] = (byDay[d] ?? 0) + 1;
    }
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 86400e3).toISOString().slice(0, 10);
      return { day: d.slice(5), signups: byDay[d] ?? 0 };
    });
    return { signups: days };
  });
