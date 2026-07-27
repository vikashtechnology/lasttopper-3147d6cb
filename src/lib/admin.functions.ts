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

/* ------------------------ Question bank bulk upload ------------------------ */

const bankRowSchema = z.object({
  question: z.string().min(3),
  options: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  }),
  correct: z.enum(["A", "B", "C", "D"]),
  hint: z.string().optional().default(""),
  explanation: z.string().optional().default(""),
  profession: z.enum(["pcm", "pcb"]).nullable().optional(),
  chapter_id: z.string().uuid().nullable().optional(),
  subject_code: z.string().nullable().optional(),
  exam: z.string().max(40).nullable().optional(),
  exam_year: z.number().int().min(1980).max(2100).nullable().optional(),

});

const bulkUploadSchema = z.object({
  rows: z.array(bankRowSchema).min(1).max(2000),
});

export const adminBulkUploadQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkUploadSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.rows.map((r) => ({
      question: r.question,
      options: r.options as unknown as never,
      correct: r.correct,
      hint: r.hint ?? "",
      explanation: r.explanation ?? "",
      profession: r.profession ?? null,
      chapter_id: r.chapter_id ?? null,
      subject_code: r.subject_code ?? null,
      exam: r.exam ? r.exam.toUpperCase() : null,
      exam_year: r.exam_year ?? null,

      source: "admin",
      created_by: context.userId,
    }));
    // insert in chunks of 200 to stay comfortably under any statement limits
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error, count } = await supabaseAdmin
        .from("question_bank")
        .insert(chunk as unknown as never, { count: "exact" });
      if (error) throw error;
      inserted += count ?? chunk.length;
    }
    return { inserted };
  });

export const adminBankStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [total, ai, admin] = await Promise.all([
      supabaseAdmin.from("question_bank").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("question_bank").select("id", { count: "exact", head: true }).eq("source", "ai"),
      supabaseAdmin.from("question_bank").select("id", { count: "exact", head: true }).eq("source", "admin"),
    ]);
    return {
      total: total.count ?? 0,
      ai: ai.count ?? 0,
      admin: admin.count ?? 0,
    };
  });


/* ---------------- Owner-only: manage admins ---------------- */

const OWNER_EMAIL = "vikashraoa2343@gmail.com";

function isOwnerCtx(context: { claims: Record<string, unknown> }) {
  const email = (context.claims?.email as string | undefined)?.toLowerCase();
  return email === OWNER_EMAIL;
}

function assertOwner(context: { claims: Record<string, unknown> }) {
  if (!isOwnerCtx(context)) throw new Error("Forbidden: owner only");
}

export const amIOwner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ owner: isOwnerCtx(context) }));

export const ownerListAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles").select("user_id, role, created_at").eq("role", "admin");
    if (error) throw error;
    const ids = (roles ?? []).map((r) => r.user_id as string);
    if (!ids.length) return [];
    const { data: users } = await supabaseAdmin
      .from("users").select("id, email, full_name, avatar_url").in("id", ids);
    return (roles ?? []).map((r) => {
      const u = users?.find((x) => x.id === r.user_id);
      return {
        user_id: r.user_id as string,
        created_at: r.created_at as string,
        email: (u?.email as string) ?? null,
        full_name: (u?.full_name as string) ?? null,
        avatar_url: (u?.avatar_url as string) ?? null,
        is_owner: (u?.email as string)?.toLowerCase() === OWNER_EMAIL,
      };
    });
  });

export const ownerSetAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().email().optional(), user_id: z.string().uuid().optional(), make: z.boolean() })
      .refine((v) => v.email || v.user_id, "email or user_id required")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userId = data.user_id;
    let email = data.email?.toLowerCase();
    if (!userId && email) {
      const { data: u } = await supabaseAdmin.from("users").select("id, email").ilike("email", email).maybeSingle();
      if (!u) throw new Error("No user found with that email. They must sign up first.");
      userId = u.id as string;
    } else if (userId && !email) {
      const { data: u } = await supabaseAdmin.from("users").select("email").eq("id", userId).maybeSingle();
      email = (u?.email as string | undefined)?.toLowerCase();
    }

    if (!data.make && email === OWNER_EMAIL) throw new Error("The owner account cannot be removed.");

    if (data.make) {
      const { error } = await supabaseAdmin
        .from("user_roles").insert({ user_id: userId!, role: "admin" });
      if (error && !`${error.message}`.includes("duplicate")) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles").delete().eq("user_id", userId!).eq("role", "admin");
      if (error) throw error;
    }
    return { ok: true, user_id: userId, email };
  });

/* ---------------- Announcements (broadcast to all users) ---------------- */

export const adminBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      title: z.string().trim().min(3).max(120),
      body: z.string().trim().max(1000).optional().default(""),
      link: z.string().trim().max(300).optional().default(""),
      audience: z.enum(["all", "pro", "free"]).optional().default("all"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin.from("users").select("id").eq("is_banned", false);
    if (data.audience === "pro") q = q.eq("is_pro", true);
    if (data.audience === "free") q = q.eq("is_pro", false);
    const { data: users, error } = await q;
    if (error) throw error;

    const ids = (users ?? []).map((u) => u.id as string);
    if (!ids.length) return { sent: 0 };

    const rows = ids.map((id) => ({
      user_id: id,
      kind: "announcement",
      title: data.title,
      body: data.body || null,
      link: data.link || null,
    }));

    let sent = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: insErr } = await supabaseAdmin
        .from("notifications")
        .insert(chunk as unknown as never);
      if (insErr) throw insErr;
      sent += chunk.length;
    }

    await sendTelegramAlert(`📣 Announcement sent to ${sent} users\n<b>${data.title}</b>\n${data.body ?? ""}`);
    return { sent };
  });

export const adminListAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("title, body, created_at")
      .eq("kind", "announcement")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    const seen = new Map<string, { title: string; body: string | null; created_at: string; count: number }>();
    for (const n of data ?? []) {
      const key = `${n.title}|${(n.created_at as string).slice(0, 16)}`;
      const cur = seen.get(key);
      if (cur) cur.count += 1;
      else seen.set(key, { title: n.title as string, body: (n.body as string) ?? null, created_at: n.created_at as string, count: 1 });
    }
    return Array.from(seen.values()).slice(0, 20);
  });
