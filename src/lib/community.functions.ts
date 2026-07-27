import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTelegramAlert, sendTelegramDocument, safeFileName } from "@/lib/telegram-alert";

// ==================== FORUMS ====================

export const listForumCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("forum_categories")
      .select("id, slug, name, description")
      .order("display_order");
    if (error) throw error;
    return data ?? [];
  });

export const listForumPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ category_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: posts, error } = await context.supabase
      .from("forum_posts")
      .select("id, title, body, upvote_count, reply_count, view_count, created_at, user_id")
      .eq("category_id", data.category_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id)));
    const authors = userIds.length
      ? (await context.supabase.from("public_profiles").select("id, full_name, avatar_url").in("id", userIds)).data ?? []
      : [];
    const map = new Map(authors.map((a) => [a.id, a]));
    return (posts ?? []).map((p) => ({ ...p, author: map.get(p.user_id) ?? null }));
  });

export const searchForumPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: posts, error } = await context.supabase
      .from("forum_posts")
      .select("id, title, upvote_count, reply_count, created_at, category_id")
      .ilike("title", `%${data.q}%`)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return posts ?? [];
  });

export const createForumPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      category_id: z.string().uuid(),
      title: z.string().trim().min(4).max(160),
      body: z.string().trim().min(4).max(8000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("forum_posts")
      .insert({ category_id: data.category_id, user_id: context.userId, title: data.title, body: data.body })
      .select("id").single();
    if (error) throw error;
    await context.supabase.from("activity_events").insert({
      user_id: context.userId, kind: "forum_post_created",
      payload: { post_id: row.id, title: data.title },
    });
    return { id: row.id };
  });

export const getForumPost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ post_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: post, error } = await context.supabase
      .from("forum_posts")
      .select("id, title, body, category_id, upvote_count, reply_count, view_count, created_at, user_id")
      .eq("id", data.post_id).maybeSingle();
    if (error) throw error;
    if (!post) return null;
    const [{ data: author }, { data: replies }, { data: myVote }] = await Promise.all([
      context.supabase.from("public_profiles").select("id, full_name, avatar_url, reputation").eq("id", post.user_id).maybeSingle(),
      context.supabase.from("forum_replies")
        .select("id, body, upvote_count, created_at, user_id")
        .eq("post_id", data.post_id).order("created_at"),
      context.supabase.from("forum_votes")
        .select("value").eq("user_id", context.userId).eq("target_type", "post").eq("target_id", data.post_id).maybeSingle(),
    ]);
    const replyUserIds = Array.from(new Set((replies ?? []).map((r) => r.user_id)));
    const replyAuthors = replyUserIds.length
      ? (await context.supabase.from("public_profiles").select("id, full_name, avatar_url, reputation").in("id", replyUserIds)).data ?? []
      : [];
    const rm = new Map(replyAuthors.map((a) => [a.id, a]));
    // increment view count (fire and forget)
    await context.supabase.from("forum_posts").update({ view_count: (post.view_count ?? 0) + 1 }).eq("id", post.id);
    return {
      post: { ...post, author },
      replies: (replies ?? []).map((r) => ({ ...r, author: rm.get(r.user_id) ?? null })),
      my_vote: myVote?.value ?? 0,
    };
  });

export const replyToPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ post_id: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("forum_replies")
      .insert({ post_id: data.post_id, user_id: context.userId, body: data.body });
    if (error) throw error;
    return { ok: true };
  });

export const voteOnTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      target_type: z.enum(["post", "reply"]),
      target_id: z.string().uuid(),
      value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Remove existing vote for that target
    await context.supabase.from("forum_votes")
      .delete().eq("user_id", context.userId)
      .eq("target_type", data.target_type).eq("target_id", data.target_id);
    if (data.value !== 0) {
      const { error } = await context.supabase.from("forum_votes")
        .insert({ user_id: context.userId, target_type: data.target_type, target_id: data.target_id, value: data.value });
      if (error) throw error;
    }
    return { ok: true };
  });

// ==================== DOUBTS ====================

export const listDoubts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().optional(), subject_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("doubts")
      .select("id, title, body, image_url, resolved, upvote_count, reply_count, created_at, user_id, subject_id, chapter_id")
      .order("created_at", { ascending: false }).limit(50);
    if (data.q) q = q.ilike("title", `%${data.q}%`);
    if (data.subject_id) q = q.eq("subject_id", data.subject_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const authors = userIds.length
      ? (await context.supabase.from("public_profiles").select("id, full_name, avatar_url").in("id", userIds)).data ?? []
      : [];
    const map = new Map(authors.map((a) => [a.id, a]));
    return (rows ?? []).map((r) => ({ ...r, author: map.get(r.user_id) ?? null }));
  });

export const createDoubt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      title: z.string().trim().min(4).max(200),
      body: z.string().trim().min(4).max(4000),
      subject_id: z.string().uuid().optional(),
      chapter_id: z.string().uuid().optional(),
      image_url: z.string().url().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("doubts")
      .insert({
        user_id: context.userId, title: data.title, body: data.body,
        subject_id: data.subject_id ?? null, chapter_id: data.chapter_id ?? null,
        image_url: data.image_url ?? null,
      }).select("id").single();
    if (error) throw error;
    await context.supabase.from("activity_events").insert({
      user_id: context.userId, kind: "doubt_created", payload: { doubt_id: row.id, title: data.title },
    });
    return { id: row.id };
  });

export const getDoubt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ doubt_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doubt, error } = await context.supabase.from("doubts")
      .select("id, title, body, image_url, resolved, upvote_count, reply_count, created_at, user_id, subject_id, chapter_id")
      .eq("id", data.doubt_id).maybeSingle();
    if (error) throw error;
    if (!doubt) return null;
    const [{ data: author }, { data: replies }] = await Promise.all([
      context.supabase.from("public_profiles").select("id, full_name, avatar_url, reputation").eq("id", doubt.user_id).maybeSingle(),
      context.supabase.from("doubt_replies")
        .select("id, body, image_url, is_accepted, upvote_count, created_at, user_id")
        .eq("doubt_id", data.doubt_id).order("is_accepted", { ascending: false }).order("created_at"),
    ]);
    const ids = Array.from(new Set((replies ?? []).map((r) => r.user_id)));
    const auths = ids.length
      ? (await context.supabase.from("public_profiles").select("id, full_name, avatar_url, reputation").in("id", ids)).data ?? []
      : [];
    const m = new Map(auths.map((a) => [a.id, a]));
    return {
      doubt: { ...doubt, author },
      replies: (replies ?? []).map((r) => ({ ...r, author: m.get(r.user_id) ?? null })),
    };
  });

export const replyToDoubt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      doubt_id: z.string().uuid(),
      body: z.string().trim().min(1).max(4000),
      image_url: z.string().url().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("doubt_replies")
      .insert({ doubt_id: data.doubt_id, user_id: context.userId, body: data.body, image_url: data.image_url ?? null });
    if (error) throw error;
    // notify doubt owner
    const { data: d0 } = await context.supabase.from("doubts")
      .select("user_id, title").eq("id", data.doubt_id).maybeSingle();
    if (d0 && d0.user_id !== context.userId) {
      await context.supabase.from("notifications").insert({
        user_id: d0.user_id, kind: "doubt_reply",
        title: "New reply on your doubt", body: d0.title, link: `/community/doubt/${data.doubt_id}`,
      });
    }
    return { ok: true };
  });

export const acceptDoubtReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reply_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("doubt_replies")
      .update({ is_accepted: true }).eq("id", data.reply_id);
    if (error) throw error;
    return { ok: true };
  });

// ==================== IMAGE UPLOAD (signed URL for doubt-images) ====================

export const createDoubtImageUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ext: z.string().min(2).max(6) }).parse(d))
  .handler(async ({ data, context }) => {
    const path = `${context.userId}/${crypto.randomUUID()}.${data.ext.replace(/[^a-z0-9]/gi, "")}`;
    const { data: signed, error } = await context.supabase.storage
      .from("doubt-images").createSignedUploadUrl(path);
    if (error) throw error;
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const getDoubtImageUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("doubt-images").createSignedUrl(data.path, 3600);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

// ==================== STUDY GROUPS ====================

export const listStudyGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("study_groups")
      .select("id, name, description, is_private, member_count, owner_id, created_at")
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data ?? [];
  });

export const createStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(3).max(60),
      description: z.string().trim().max(500).optional(),
      is_private: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("study_groups")
      .insert({ owner_id: context.userId, name: data.name, description: data.description ?? null, is_private: data.is_private })
      .select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const joinStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("study_group_members")
      .insert({ group_id: data.group_id, user_id: context.userId, role: "member" });
    if (error && !error.message.includes("duplicate")) throw error;
    return { ok: true };
  });

export const leaveStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("study_group_members")
      .delete().eq("group_id", data.group_id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const getStudyGroup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: g }, { data: members }, { data: me }] = await Promise.all([
      context.supabase.from("study_groups").select("*").eq("id", data.group_id).maybeSingle(),
      context.supabase.from("study_group_members").select("user_id, role, joined_at").eq("group_id", data.group_id),
      context.supabase.from("study_group_members").select("role").eq("group_id", data.group_id).eq("user_id", context.userId).maybeSingle(),
    ]);
    if (!g) return null;
    const ids = (members ?? []).map((m) => m.user_id);
    const profiles = ids.length
      ? (await context.supabase.from("users").select("id, full_name, avatar_url").in("id", ids)).data ?? []
      : [];
    const pm = new Map(profiles.map((p) => [p.id, p]));
    return {
      group: g,
      is_member: !!me,
      members: (members ?? []).map((m) => ({ ...m, profile: pm.get(m.user_id) ?? null })),
    };
  });

export const listGroupMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: msgs, error } = await context.supabase.from("study_group_messages")
      .select("id, body, created_at, user_id")
      .eq("group_id", data.group_id).order("created_at", { ascending: true }).limit(200);
    if (error) throw error;
    const ids = Array.from(new Set((msgs ?? []).map((m) => m.user_id)));
    const profiles = ids.length
      ? (await context.supabase.from("users").select("id, full_name, avatar_url").in("id", ids)).data ?? []
      : [];
    const pm = new Map(profiles.map((p) => [p.id, p]));
    return (msgs ?? []).map((m) => ({ ...m, author: pm.get(m.user_id) ?? null }));
  });

export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ group_id: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("study_group_messages")
      .insert({ group_id: data.group_id, user_id: context.userId, body: data.body });
    if (error) throw error;
    return { ok: true };
  });

// ==================== FOLLOWS & PROFILES ====================

export const followUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.user_id === context.userId) throw new Error("cannot follow yourself");
    const { error } = await context.supabase.from("follows")
      .insert({ follower_id: context.userId, following_id: data.user_id });
    if (error && !error.message.includes("duplicate")) throw error;
    return { ok: true };
  });

export const unfollowUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("follows")
      .delete().eq("follower_id", context.userId).eq("following_id", data.user_id);
    if (error) throw error;
    return { ok: true };
  });

export const getPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: user }, { data: badges }, { count: followersCount }, { count: followingCount }, { data: iFollow }] = await Promise.all([
      context.supabase.from("public_profiles")
        .select("id, full_name, avatar_url, profession, streak, total_accuracy, reputation, bio, created_at")
        .eq("id", data.user_id).maybeSingle(),
      supabaseAdmin.from("user_badges").select("badge_id, awarded_at").eq("user_id", data.user_id),
      supabaseAdmin.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", data.user_id),
      supabaseAdmin.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", data.user_id),
      context.supabase.from("follows").select("id").eq("follower_id", context.userId).eq("following_id", data.user_id).maybeSingle(),
    ]);
    const badgeIds = (badges ?? []).map((b) => b.badge_id);
    const badgeMeta = badgeIds.length
      ? (await context.supabase.from("badges").select("id, slug, name, description, icon").in("id", badgeIds)).data ?? []
      : [];
    return {
      user, badges: badgeMeta,
      followers_count: followersCount ?? 0,
      following_count: followingCount ?? 0,
      i_follow: !!iFollow,
    };
  });

// ==================== ACTIVITY FEED ====================

export const getActivityFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Get list of users I follow
    const { data: follows } = await context.supabase.from("follows")
      .select("following_id").eq("follower_id", context.userId);
    const ids = (follows ?? []).map((f) => f.following_id);
    if (ids.length === 0) {
      return { events: [], trending_doubts: await trendingDoubts(context.supabase) };
    }
    const { data: events, error } = await supabaseAdmin.from("activity_events")
      .select("id, user_id, kind, payload, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false }).limit(40);
    if (error) throw error;
    const userIds = Array.from(new Set((events ?? []).map((e) => e.user_id)));
    const profiles = userIds.length
      ? (await context.supabase.from("public_profiles").select("id, full_name, avatar_url").in("id", userIds)).data ?? []
      : [];
    const pm = new Map(profiles.map((p) => [p.id, p]));
    return {
      events: (events ?? []).map((e) => ({ ...e, author: pm.get(e.user_id) ?? null })),
      trending_doubts: await trendingDoubts(context.supabase),
    };
  });

async function trendingDoubts(sb: import("@supabase/supabase-js").SupabaseClient) {
  const { data } = await sb.from("doubts")
    .select("id, title, upvote_count, reply_count, created_at")
    .order("upvote_count", { ascending: false }).limit(5);
  return data ?? [];
}

// ==================== REPORTS ====================

export const reportContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      target_type: z.enum(["forum_post", "forum_reply", "doubt", "doubt_reply"]),
      target_id: z.string().uuid(),
      reason: z.string().min(2).max(80),
      message: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("post_reports").insert({
      reporter_id: context.userId, target_type: data.target_type, target_id: data.target_id,
      reason: data.reason, message: data.message ?? null,
    });
    if (error) throw error;
    await sendTelegramDocument(
      safeFileName([data.target_type, `report_${data.target_id}`], "txt"),
      [
        "CONTENT REPORT",
        "====================",
        `Type      : ${data.target_type}`,
        `Target ID : ${data.target_id}`,
        `Reason    : ${data.reason}`,
        `Message   : ${data.message ?? "-"}`,
        `Reporter  : ${context.userId}`,
        `Time      : ${new Date().toISOString()}`,
      ].join("\n"),
      `🚩 <b>Content reported</b> — ${data.target_type}`,
    );
    return { ok: true };
  });

// ==================== NOTIFICATIONS ====================

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId).is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });

export const unreadNotificationsCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId).is("read_at", null);
    if (error) throw error;
    return { count: count ?? 0 };
  });

// ==================== SIGNUP TELEGRAM ALERT (called on first-time login) ====================

export const notifyFirstLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: u } = await context.supabase.from("users")
      .select("email, full_name, last_active_date").eq("id", context.userId).maybeSingle();
    if (u && u.last_active_date === null) {
      await sendTelegramDocument(
        safeFileName([String(u.full_name ?? "user"), "first_login"], "txt"),
        [
          "FIRST LOGIN",
          "====================",
          `Name  : ${u.full_name ?? "Unknown"}`,
          `Email : ${u.email ?? "no email"}`,
          `User ID: ${context.userId}`,
          `Time  : ${new Date().toISOString()}`,
        ].join("\n"),
        `👤 <b>First login</b> — ${u.full_name ?? "Unknown"}`,
      );
    }
    return { ok: true };
  });
