import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { deterministicDocumentId } from "@/integrations/firebase/data.server";
import { getFirebaseAdminDb } from "@/integrations/firebase/admin.server";

async function assertCanPost(transaction: Transaction, db: Firestore, userId: string) {
  const user = await transaction.get(db.collection("users").doc(userId));
  if (!user.exists) throw new Error("User profile is missing");
  if (user.data()?.is_banned === true) throw new Error("This account is banned");
}

export async function createForumPostAtomic(
  userId: string,
  input: { category_id: string; title: string; body: string },
) {
  const db = await getFirebaseAdminDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    await assertCanPost(transaction, db, userId);
    transaction.create(db.collection("forum_posts").doc(id), {
      id,
      user_id: userId,
      ...input,
      is_flagged: false,
      upvote_count: 0,
      reply_count: 0,
      view_count: 0,
      created_at: now,
      updated_at: now,
    });
  });
  return id;
}

export async function incrementForumView(postId: string) {
  const db = await getFirebaseAdminDb();
  await db
    .collection("forum_posts")
    .doc(postId)
    .update({
      view_count: FieldValue.increment(1),
      updated_at: new Date().toISOString(),
    });
}

export async function createForumReplyAtomic(userId: string, postId: string, body: string) {
  const db = await getFirebaseAdminDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    await assertCanPost(transaction, db, userId);
    const postRef = db.collection("forum_posts").doc(postId);
    const post = await transaction.get(postRef);
    if (!post.exists) throw new Error("Forum post not found");
    transaction.create(db.collection("forum_replies").doc(id), {
      id,
      post_id: postId,
      user_id: userId,
      body,
      is_flagged: false,
      upvote_count: 0,
      created_at: now,
      updated_at: now,
    });
    transaction.update(postRef, {
      reply_count: FieldValue.increment(1),
      updated_at: now,
    });
  });
  return id;
}

export async function setForumVoteAtomic(
  userId: string,
  targetType: "post" | "reply",
  targetId: string,
  value: -1 | 0 | 1,
) {
  const db = await getFirebaseAdminDb();
  const voteId = deterministicDocumentId("forum_votes", [userId, targetType, targetId]);
  const voteRef = db.collection("forum_votes").doc(voteId);
  const targetRef = db
    .collection(targetType === "post" ? "forum_posts" : "forum_replies")
    .doc(targetId);
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const [vote, target] = await Promise.all([
      transaction.get(voteRef),
      transaction.get(targetRef),
    ]);
    if (!target.exists) throw new Error("Vote target not found");
    const previous = Number(vote.data()?.value ?? 0);
    if (value === 0) transaction.delete(voteRef);
    else {
      transaction.set(voteRef, {
        id: voteId,
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
        value,
        created_at: vote.data()?.created_at ?? now,
        updated_at: now,
      });
    }
    const delta = value - previous;
    if (delta !== 0) {
      transaction.update(targetRef, {
        upvote_count: FieldValue.increment(delta),
        updated_at: now,
      });
    }
  });
}

export async function createDoubtAtomic(
  userId: string,
  input: {
    title: string;
    body: string;
    subject_id: string | null;
    chapter_id: string | null;
    image_url: string | null;
  },
) {
  const db = await getFirebaseAdminDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    await assertCanPost(transaction, db, userId);
    transaction.create(db.collection("doubts").doc(id), {
      id,
      user_id: userId,
      ...input,
      resolved: false,
      is_flagged: false,
      upvote_count: 0,
      reply_count: 0,
      created_at: now,
      updated_at: now,
    });
  });
  return id;
}

export async function createDoubtReplyAtomic(
  userId: string,
  doubtId: string,
  input: { body: string; image_url: string | null },
) {
  const db = await getFirebaseAdminDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    await assertCanPost(transaction, db, userId);
    const doubtRef = db.collection("doubts").doc(doubtId);
    const doubt = await transaction.get(doubtRef);
    if (!doubt.exists) throw new Error("Doubt not found");
    transaction.create(db.collection("doubt_replies").doc(id), {
      id,
      doubt_id: doubtId,
      user_id: userId,
      ...input,
      is_accepted: false,
      upvote_count: 0,
      created_at: now,
      updated_at: now,
    });
    transaction.update(doubtRef, {
      reply_count: FieldValue.increment(1),
      updated_at: now,
    });
  });
  return id;
}

export async function acceptDoubtReplyAtomic(ownerId: string, replyId: string) {
  const db = await getFirebaseAdminDb();
  const replyRef = db.collection("doubt_replies").doc(replyId);
  await db.runTransaction(async (transaction) => {
    const reply = await transaction.get(replyRef);
    if (!reply.exists) throw new Error("Reply not found");
    const replyData = reply.data()!;
    const doubtRef = db.collection("doubts").doc(String(replyData.doubt_id));
    const doubt = await transaction.get(doubtRef);
    if (!doubt.exists || doubt.data()?.user_id !== ownerId) {
      throw new Error("Only the doubt owner can accept a reply");
    }
    if (replyData.is_accepted === true) return;
    if (doubt.data()?.accepted_reply_id && doubt.data()?.accepted_reply_id !== replyId) {
      throw new Error("A reply has already been accepted for this doubt");
    }
    const now = new Date().toISOString();
    transaction.update(replyRef, { is_accepted: true, updated_at: now });
    transaction.update(doubtRef, {
      resolved: true,
      accepted_reply_id: replyId,
      updated_at: now,
    });
    transaction.update(db.collection("users").doc(String(replyData.user_id)), {
      reputation: FieldValue.increment(10),
      updated_at: now,
    });
  });
}

export async function createStudyGroupAtomic(
  ownerId: string,
  input: { name: string; description: string | null; is_private: boolean },
) {
  const db = await getFirebaseAdminDb();
  const id = randomUUID();
  const memberId = deterministicDocumentId("study_group_members", [id, ownerId]);
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    await assertCanPost(transaction, db, ownerId);
    transaction.create(db.collection("study_groups").doc(id), {
      id,
      owner_id: ownerId,
      ...input,
      member_count: 1,
      created_at: now,
      updated_at: now,
    });
    transaction.create(db.collection("study_group_members").doc(memberId), {
      id: memberId,
      group_id: id,
      user_id: ownerId,
      role: "owner",
      joined_at: now,
      created_at: now,
      updated_at: now,
    });
  });
  return id;
}

export async function setStudyGroupMembership(
  userId: string,
  groupId: string,
  operation: "join" | "leave",
) {
  const db = await getFirebaseAdminDb();
  const groupRef = db.collection("study_groups").doc(groupId);
  const memberId = deterministicDocumentId("study_group_members", [groupId, userId]);
  const memberRef = db.collection("study_group_members").doc(memberId);
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const [group, membership] = await Promise.all([
      transaction.get(groupRef),
      transaction.get(memberRef),
    ]);
    if (!group.exists) throw new Error("Study group not found");
    if (operation === "join") {
      if (group.data()?.is_private === true)
        throw new Error("Private groups require an invitation");
      if (membership.exists) return;
      transaction.create(memberRef, {
        id: memberId,
        group_id: groupId,
        user_id: userId,
        role: "member",
        joined_at: now,
        created_at: now,
        updated_at: now,
      });
      transaction.update(groupRef, {
        member_count: FieldValue.increment(1),
        updated_at: now,
      });
      return;
    }
    if (!membership.exists) return;
    if (membership.data()?.role === "owner")
      throw new Error("The group owner cannot leave the group");
    transaction.delete(memberRef);
    transaction.update(groupRef, {
      member_count: FieldValue.increment(-1),
      updated_at: now,
    });
  });
}

export async function requireStudyGroupMember(userId: string, groupId: string) {
  const db = await getFirebaseAdminDb();
  const memberId = deterministicDocumentId("study_group_members", [groupId, userId]);
  const member = await db.collection("study_group_members").doc(memberId).get();
  if (!member.exists) throw new Error("Study group membership required");
}

export async function sendStudyGroupMessageAtomic(userId: string, groupId: string, body: string) {
  const db = await getFirebaseAdminDb();
  const memberId = deterministicDocumentId("study_group_members", [groupId, userId]);
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const member = await transaction.get(db.collection("study_group_members").doc(memberId));
    if (!member.exists) throw new Error("Study group membership required");
    transaction.create(db.collection("study_group_messages").doc(id), {
      id,
      group_id: groupId,
      user_id: userId,
      body,
      created_at: now,
      updated_at: now,
    });
  });
}

export async function setFollowAtomic(followerId: string, followingId: string, following: boolean) {
  if (followerId === followingId) throw new Error("Cannot follow yourself");
  const db = await getFirebaseAdminDb();
  const id = deterministicDocumentId("follows", [followerId, followingId]);
  const ref = db.collection("follows").doc(id);
  await db.runTransaction(async (transaction) => {
    const [existing, target] = await Promise.all([
      transaction.get(ref),
      transaction.get(db.collection("users").doc(followingId)),
    ]);
    if (!target.exists) throw new Error("User not found");
    if (!following) {
      if (existing.exists) transaction.delete(ref);
      return;
    }
    if (existing.exists) return;
    const now = new Date().toISOString();
    transaction.create(ref, {
      id,
      follower_id: followerId,
      following_id: followingId,
      created_at: now,
      updated_at: now,
    });
  });
}
