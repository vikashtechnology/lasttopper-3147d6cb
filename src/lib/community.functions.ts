import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { firebaseUidSchema } from "@/integrations/firebase/validation";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import {
  sendTelegramAlert,
  sendTelegramDocument,
  safeFileName,
  buildReport,
  fmtIST,
} from "@/lib/telegram-alert";

// ==================== FORUMS ====================

export const listForumCategories = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.db
      .from("forum_categories")
      .select("id, slug, name, description")
      .order("display_order");
    if (error) throw error;
    return data ?? [];
  });

export const listForumPosts = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ category_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: posts, error } = await context.db
      .from("forum_posts")
      .select("id, title, body, upvote_count, reply_count, view_count, created_at, user_id")
      .eq("category_id", data.category_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id)));
    const authors = userIds.length
      ? ((
          await context.db
            .from("public_profiles")
            .select("id, full_name, avatar_url")
            .in("id", userIds)
        ).data ?? [])
      : [];
    const map = new Map(authors.map((a) => [a.id, a]));
    return (posts ?? []).map((p) => ({ ...p, author: map.get(p.user_id) ?? null }));
  });

export const searchForumPosts = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: posts, error } = await context.db
      .from("forum_posts")
      .select("id, title, upvote_count, reply_count, created_at, category_id")
      .ilike("title", `%${data.q}%`)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return posts ?? [];
  });

export const createForumPost = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        category_id: z.string().uuid(),
        title: z.string().trim().min(4).max(160),
        body: z.string().trim().min(4).max(8000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createForumPostAtomic } = await import("@/lib/community-transactions.server");
    const id = await createForumPostAtomic(context.userId, data);
    await context.db.from("activity_events").insert({
      user_id: context.userId,
      kind: "forum_post_created",
      payload: { post_id: id, title: data.title },
    });
    return { id };
  });

export const getForumPost = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ post_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: post, error } = await context.db
      .from("forum_posts")
      .select(
        "id, title, body, category_id, upvote_count, reply_count, view_count, created_at, user_id",
      )
      .eq("id", data.post_id)
      .maybeSingle();
    if (error) throw error;
    if (!post) return null;
    const [{ data: author }, { data: replies }, { data: myVote }] = await Promise.all([
      context.db
        .from("public_profiles")
        .select("id, full_name, avatar_url, reputation")
        .eq("id", post.user_id)
        .maybeSingle(),
      context.db
        .from("forum_replies")
        .select("id, body, upvote_count, created_at, user_id")
        .eq("post_id", data.post_id)
        .order("created_at"),
      context.db
        .from("forum_votes")
        .select("value")
        .eq("user_id", context.userId)
        .eq("target_type", "post")
        .eq("target_id", data.post_id)
        .maybeSingle(),
    ]);
    const replyUserIds = Array.from(new Set((replies ?? []).map((r) => r.user_id)));
    const replyAuthors = replyUserIds.length
      ? ((
          await context.db
            .from("public_profiles")
            .select("id, full_name, avatar_url, reputation")
            .in("id", replyUserIds)
        ).data ?? [])
      : [];
    const rm = new Map(replyAuthors.map((a) => [a.id, a]));
    // Use an atomic increment so concurrent readers cannot lose view counts.
    const { incrementForumView } = await import("@/lib/community-transactions.server");
    await incrementForumView(post.id);
    return {
      post: { ...post, author },
      replies: (replies ?? []).map((r) => ({ ...r, author: rm.get(r.user_id) ?? null })),
      my_vote: myVote?.value ?? 0,
    };
  });

export const replyToPost = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ post_id: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createForumReplyAtomic } = await import("@/lib/community-transactions.server");
    await createForumReplyAtomic(context.userId, data.post_id, data.body);
    return { ok: true };
  });

export const voteOnTarget = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target_type: z.enum(["post", "reply"]),
        target_id: z.string().uuid(),
        value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setForumVoteAtomic } = await import("@/lib/community-transactions.server");
    await setForumVoteAtomic(context.userId, data.target_type, data.target_id, data.value);
    return { ok: true };
  });

// ==================== DOUBTS ====================

export const listDoubts = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().optional(), subject_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.db
      .from("doubts")
      .select(
        "id, title, body, image_url, resolved, upvote_count, reply_count, created_at, user_id, subject_id, chapter_id",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.q) q = q.ilike("title", `%${data.q}%`);
    if (data.subject_id) q = q.eq("subject_id", data.subject_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const authors = userIds.length
      ? ((
          await context.db
            .from("public_profiles")
            .select("id, full_name, avatar_url")
            .in("id", userIds)
        ).data ?? [])
      : [];
    const map = new Map(authors.map((a) => [a.id, a]));
    return (rows ?? []).map((r) => ({ ...r, author: map.get(r.user_id) ?? null }));
  });

export const createDoubt = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(4).max(200),
        body: z.string().trim().min(4).max(4000),
        subject_id: z.string().uuid().optional(),
        chapter_id: z.string().uuid().optional(),
        image_url: z.string().url().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createDoubtAtomic } = await import("@/lib/community-transactions.server");
    const id = await createDoubtAtomic(context.userId, {
      ...data,
      subject_id: data.subject_id ?? null,
      chapter_id: data.chapter_id ?? null,
      image_url: data.image_url ?? null,
    });
    await context.db.from("activity_events").insert({
      user_id: context.userId,
      kind: "doubt_created",
      payload: { doubt_id: id, title: data.title },
    });
    return { id };
  });

export const getDoubt = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ doubt_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doubt, error } = await context.db
      .from("doubts")
      .select(
        "id, title, body, image_url, resolved, upvote_count, reply_count, created_at, user_id, subject_id, chapter_id",
      )
      .eq("id", data.doubt_id)
      .maybeSingle();
    if (error) throw error;
    if (!doubt) return null;
    const [{ data: author }, { data: replies }] = await Promise.all([
      context.db
        .from("public_profiles")
        .select("id, full_name, avatar_url, reputation")
        .eq("id", doubt.user_id)
        .maybeSingle(),
      context.db
        .from("doubt_replies")
        .select("id, body, image_url, is_accepted, upvote_count, created_at, user_id")
        .eq("doubt_id", data.doubt_id)
        .order("is_accepted", { ascending: false })
        .order("created_at"),
    ]);
    const ids = Array.from(new Set((replies ?? []).map((r) => r.user_id)));
    const auths = ids.length
      ? ((
          await context.db
            .from("public_profiles")
            .select("id, full_name, avatar_url, reputation")
            .in("id", ids)
        ).data ?? [])
      : [];
    const m = new Map(auths.map((a) => [a.id, a]));
    return {
      doubt: { ...doubt, author },
      replies: (replies ?? []).map((r) => ({ ...r, author: m.get(r.user_id) ?? null })),
    };
  });

export const replyToDoubt = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        doubt_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
        image_url: z.string().url().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createDoubtReplyAtomic } = await import("@/lib/community-transactions.server");
    await createDoubtReplyAtomic(context.userId, data.doubt_id, {
      body: data.body,
      image_url: data.image_url ?? null,
    });
    // notify doubt owner
    const { data: d0 } = await context.db
      .from("doubts")
      .select("user_id, title")
      .eq("id", data.doubt_id)
      .maybeSingle();
    if (d0 && d0.user_id !== context.userId) {
      await context.db.from("notifications").insert({
        user_id: d0.user_id,
        kind: "doubt_reply",
        title: "New reply on your doubt",
        body: d0.title,
        link: `/community/doubt/${data.doubt_id}`,
      });
    }
    return { ok: true };
  });

export const acceptDoubtReply = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ reply_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { acceptDoubtReplyAtomic } = await import("@/lib/community-transactions.server");
    await acceptDoubtReplyAtomic(context.userId, data.reply_id);
    return { ok: true };
  });

// ==================== STUDY GROUPS ====================

export const listStudyGroups = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const [{ data, error }, { data: memberships }] = await Promise.all([
      context.db
        .from("study_groups")
        .select("id, name, description, is_private, member_count, owner_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      context.db.from("study_group_members").select("group_id").eq("user_id", context.userId),
    ]);
    if (error) throw error;
    const visibleGroupIds = new Set((memberships ?? []).map((membership) => membership.group_id));
    return (data ?? []).filter(
      (group) =>
        !group.is_private || group.owner_id === context.userId || visibleGroupIds.has(group.id),
    );
  });

export const createStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(3).max(60),
        description: z.string().trim().max(500).optional(),
        is_private: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createStudyGroupAtomic } = await import("@/lib/community-transactions.server");
    const id = await createStudyGroupAtomic(context.userId, {
      ...data,
      description: data.description ?? null,
    });
    return { id };
  });

export const joinStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { setStudyGroupMembership } = await import("@/lib/community-transactions.server");
    await setStudyGroupMembership(context.userId, data.group_id, "join");
    return { ok: true };
  });

export const leaveStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { setStudyGroupMembership } = await import("@/lib/community-transactions.server");
    await setStudyGroupMembership(context.userId, data.group_id, "leave");
    return { ok: true };
  });

export const getStudyGroup = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: g }, { data: members }, { data: me }] = await Promise.all([
      context.db.from("study_groups").select("*").eq("id", data.group_id).maybeSingle(),
      context.db
        .from("study_group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", data.group_id),
      context.db
        .from("study_group_members")
        .select("role")
        .eq("group_id", data.group_id)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (!g) return null;
    if (g.is_private && !me && g.owner_id !== context.userId) return null;
    const ids = (members ?? []).map((m) => m.user_id);
    const profiles = ids.length
      ? ((await context.db.from("users").select("id, full_name, avatar_url").in("id", ids)).data ??
        [])
      : [];
    const pm = new Map(profiles.map((p) => [p.id, p]));
    return {
      group: g,
      is_member: !!me,
      members: (members ?? []).map((m) => ({ ...m, profile: pm.get(m.user_id) ?? null })),
    };
  });

export const listGroupMessages = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireStudyGroupMember } = await import("@/lib/community-transactions.server");
    await requireStudyGroupMember(context.userId, data.group_id);
    const { data: msgs, error } = await context.db
      .from("study_group_messages")
      .select("id, body, created_at, user_id")
      .eq("group_id", data.group_id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    const ids = Array.from(new Set((msgs ?? []).map((m) => m.user_id)));
    const profiles = ids.length
      ? ((await context.db.from("users").select("id, full_name, avatar_url").in("id", ids)).data ??
        [])
      : [];
    const pm = new Map(profiles.map((p) => [p.id, p]));
    return (msgs ?? []).map((m) => ({ ...m, author: pm.get(m.user_id) ?? null }));
  });

export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ group_id: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { sendStudyGroupMessageAtomic } = await import("@/lib/community-transactions.server");
    await sendStudyGroupMessageAtomic(context.userId, data.group_id, data.body);
    return { ok: true };
  });

// ==================== FOLLOWS & PROFILES ====================

export const followUser = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: firebaseUidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { setFollowAtomic } = await import("@/lib/community-transactions.server");
    await setFollowAtomic(context.userId, data.user_id, true);
    return { ok: true };
  });

export const unfollowUser = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: firebaseUidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { setFollowAtomic } = await import("@/lib/community-transactions.server");
    await setFollowAtomic(context.userId, data.user_id, false);
    return { ok: true };
  });

export const getPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: firebaseUidSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    const [
      { data: user },
      { data: badges },
      { count: followersCount },
      { count: followingCount },
      { data: iFollow },
    ] = await Promise.all([
      context.db
        .from("public_profiles")
        .select(
          "id, full_name, avatar_url, profession, streak, total_accuracy, reputation, bio, created_at",
        )
        .eq("id", data.user_id)
        .maybeSingle(),
      firestoreAdmin.from("user_badges").select("badge_id, awarded_at").eq("user_id", data.user_id),
      firestoreAdmin
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", data.user_id),
      firestoreAdmin
        .from("follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", data.user_id),
      context.db
        .from("follows")
        .select("id")
        .eq("follower_id", context.userId)
        .eq("following_id", data.user_id)
        .maybeSingle(),
    ]);
    const badgeIds = (badges ?? []).map((b) => b.badge_id);
    const badgeMeta = badgeIds.length
      ? ((
          await context.db
            .from("badges")
            .select("id, slug, name, description, icon")
            .in("id", badgeIds)
        ).data ?? [])
      : [];
    return {
      user,
      badges: badgeMeta,
      followers_count: followersCount ?? 0,
      following_count: followingCount ?? 0,
      i_follow: !!iFollow,
    };
  });

// ==================== ACTIVITY FEED ====================

export const getActivityFeed = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    // Get list of users I follow
    const { data: follows } = await context.db
      .from("follows")
      .select("following_id")
      .eq("follower_id", context.userId);
    const ids = (follows ?? []).map((f) => f.following_id);
    if (ids.length === 0) {
      return { events: [], trending_doubts: await trendingDoubts(context.db) };
    }
    const { data: events, error } = await firestoreAdmin
      .from("activity_events")
      .select("id, user_id, kind, payload, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    const userIds = Array.from(new Set((events ?? []).map((e) => e.user_id)));
    const profiles = userIds.length
      ? ((
          await context.db
            .from("public_profiles")
            .select("id, full_name, avatar_url")
            .in("id", userIds)
        ).data ?? [])
      : [];
    const pm = new Map(profiles.map((p) => [p.id, p]));
    return {
      events: (events ?? []).map((e) => ({ ...e, author: pm.get(e.user_id) ?? null })),
      trending_doubts: await trendingDoubts(context.db),
    };
  });

async function trendingDoubts(
  sb: import("@/integrations/firebase/data.server").FirestoreDataClient,
) {
  const { data } = await sb
    .from("doubts")
    .select("id, title, upvote_count, reply_count, created_at")
    .order("upvote_count", { ascending: false })
    .limit(5);
  return data ?? [];
}

// ==================== REPORTS ====================

export const reportContent = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target_type: z.enum(["forum_post", "forum_reply", "doubt", "doubt_reply"]),
        target_id: z.string().uuid(),
        reason: z.string().min(2).max(80),
        message: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.db.from("post_reports").insert({
      reporter_id: context.userId,
      target_type: data.target_type,
      target_id: data.target_id,
      reason: data.reason,
      message: data.message ?? null,
    });
    if (error) throw error;
    await sendTelegramDocument(
      safeFileName([data.target_type, `report_${data.target_id}`], "txt"),
      buildReport("Content report", [
        ["Type", data.target_type],
        ["Target ID", data.target_id],
        ["Reason", data.reason],
        ["Message", data.message ?? "—"],
        ["Reporter", context.userId],
        ["Time", fmtIST(new Date())],
      ]),
      [`🚩 <b>Content reported</b>`, `📄 ${data.target_type}`, `❗ ${data.reason}`].join("\n"),
    );
    return { ok: true };
  });

// ==================== NOTIFICATIONS ====================

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.db
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });

export const unreadNotificationsCount = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { count: count ?? 0 };
  });

// ==================== SIGNUP TELEGRAM ALERT (called on first-time login) ====================

export const notifyFirstLogin = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { data: u } = await context.db
      .from("users")
      .select("email, full_name, last_active_date")
      .eq("id", context.userId)
      .maybeSingle();
    if (u && u.last_active_date === null) {
      await sendTelegramDocument(
        safeFileName([String(u.full_name ?? "user"), "first_login"], "txt"),
        buildReport("First login", [
          ["Name", u.full_name ?? "Unknown"],
          ["Email", u.email ?? "—"],
          ["User ID", context.userId],
          ["Time", fmtIST(new Date())],
        ]),
        [`👤 <b>First login</b>`, `🙋 ${u.full_name ?? "Unknown"}`].join("\n"),
      );
    }
    return { ok: true };
  });
