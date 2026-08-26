import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

const projectId = "demo-last-topper";
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.VITE_FIREBASE_PROJECT_ID = projectId;

let testEnv: RulesTestEnvironment;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe("deny-all client Firestore boundary", () => {
  test("rejects unauthenticated and authenticated direct reads and writes", async () => {
    const anonymous = testEnv.unauthenticatedContext().firestore();
    const student = testEnv.authenticatedContext("firebase-uid-not-a-uuid").firestore();

    await assertFails(getDoc(doc(anonymous, "users", "someone")));
    await assertFails(setDoc(doc(anonymous, "users", "someone"), { role: "admin" }));
    await assertFails(getDocs(collection(student, "users")));
    await assertFails(setDoc(doc(student, "users", "firebase-uid-not-a-uuid"), { is_pro: true }));
  });

  test("trusted server seeding does not make documents client-readable", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "server-created"), { id: "server-created" });
    });
    const student = testEnv.authenticatedContext("student").firestore();
    await assertFails(getDoc(doc(student, "users", "server-created")));
  });
});

describe("Firebase server invariants", () => {
  test("profile bootstrap is transactional and accepts a non-UUID Firebase UID", async () => {
    const { ensureFirstLoginProfile } = await import("../src/lib/profile-bootstrap.server");
    const { getFirebaseAdminDb } = await import("../src/integrations/firebase/admin.server");
    const uid = "google:firebase-uid-not-a-uuid";
    const claims = {
      uid,
      email: "STUDENT@example.com",
      name: "Student",
      picture: "https://example.com/avatar.png",
    } as never;

    await Promise.all([ensureFirstLoginProfile(uid, claims), ensureFirstLoginProfile(uid, claims)]);

    const db = await getFirebaseAdminDb();
    const snapshot = await db.collection("users").doc(uid).get();
    assert.equal(snapshot.exists, true);
    assert.equal(snapshot.data()?.id, uid);
    assert.equal(snapshot.data()?.email, "student@example.com");
    assert.equal(snapshot.data()?.is_pro, false);
    assert.match(String(snapshot.data()?.referral_code), /^[A-F0-9]{8}$/);
  });

  test("public_profiles reads users and unique inserts use UUID document IDs", async () => {
    const { FirestoreDataClient } = await import("../src/integrations/firebase/data.server");
    const { getFirebaseAdminDb } = await import("../src/integrations/firebase/admin.server");
    const db = await getFirebaseAdminDb();
    await db.collection("users").doc("firebase-user-a").set({
      id: "firebase-user-a",
      full_name: "A",
      created_at: new Date().toISOString(),
    });
    const client = new FirestoreDataClient(Promise.resolve(db));

    const profile = await client
      .from("public_profiles")
      .select("id, full_name")
      .eq("id", "firebase-user-a")
      .maybeSingle();
    assert.equal(profile.error, null);
    assert.deepEqual(profile.data, { id: "firebase-user-a", full_name: "A" });

    const first = await client
      .from("follows")
      .insert({ follower_id: "firebase-user-a", following_id: "firebase-user-b" });
    assert.equal(first.error, null);
    assert.equal(first.data, null, "writes without select must return data: null");

    const second = await client
      .from("follows")
      .insert({ follower_id: "firebase-user-a", following_id: "firebase-user-b" });
    assert.equal(second.error?.code, "already-exists");
    const follows = await db.collection("follows").get();
    assert.equal(follows.size, 1);
    assert.match(
      follows.docs[0].id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("community relationships and counters are atomic", async () => {
    const {
      createForumReplyAtomic,
      createStudyGroupAtomic,
      setForumVoteAtomic,
      setStudyGroupMembership,
    } = await import("../src/lib/community-transactions.server");
    const { getFirebaseAdminDb } = await import("../src/integrations/firebase/admin.server");
    const db = await getFirebaseAdminDb();
    const now = new Date().toISOString();
    await Promise.all([
      db.collection("users").doc("owner").set({ id: "owner", is_banned: false }),
      db.collection("users").doc("member").set({ id: "member", is_banned: false }),
      db.collection("forum_posts").doc("11111111-1111-4111-8111-111111111111").set({
        id: "11111111-1111-4111-8111-111111111111",
        reply_count: 0,
        upvote_count: 0,
        created_at: now,
      }),
    ]);

    await createForumReplyAtomic("owner", "11111111-1111-4111-8111-111111111111", "Reply");
    await setForumVoteAtomic("member", "post", "11111111-1111-4111-8111-111111111111", 1);
    await setForumVoteAtomic("member", "post", "11111111-1111-4111-8111-111111111111", -1);
    const post = await db
      .collection("forum_posts")
      .doc("11111111-1111-4111-8111-111111111111")
      .get();
    assert.equal(post.data()?.reply_count, 1);
    assert.equal(post.data()?.upvote_count, -1);
    assert.equal((await db.collection("forum_votes").get()).size, 1);

    const groupId = await createStudyGroupAtomic("owner", {
      name: "Focused study",
      description: null,
      is_private: false,
    });
    await Promise.all([
      setStudyGroupMembership("member", groupId, "join"),
      setStudyGroupMembership("member", groupId, "join"),
    ]);
    const group = await db.collection("study_groups").doc(groupId).get();
    assert.equal(group.data()?.member_count, 2);
    assert.equal(
      (await db.collection("study_group_members").where("group_id", "==", groupId).get()).size,
      2,
    );
  });

  test("Mega registration requires every fresh assigned task", async () => {
    const { runFirestoreRpc } = await import("../src/integrations/firebase/rpc.server");
    const { getFirebaseAdminDb } = await import("../src/integrations/firebase/admin.server");
    const db = await getFirebaseAdminDb();
    const testId = "22222222-2222-4222-8222-222222222222";
    const uid = "firebase-mega-user";
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const assigned = new Date(Date.now() - 10 * 60 * 1000);
    const completed = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const taskIds = [
      "33333333-3333-4333-8333-333333333331",
      "33333333-3333-4333-8333-333333333332",
    ];
    await db.collection("users").doc(uid).set({ id: uid, profession: "pcm" });
    await db
      .collection("mega_tests")
      .doc(testId)
      .set({
        id: testId,
        profession: "pcm",
        status: "scheduled",
        scheduled_start: start.toISOString(),
        scheduled_end: new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      });
    for (let index = 0; index < taskIds.length; index += 1) {
      const taskId = taskIds[index];
      await db.collection("mega_access_tasks").doc(taskId).set({ id: taskId, is_active: true });
      await db
        .collection("mega_access_task_assignments")
        .doc(`assignment-${index}`)
        .set({
          id: `assignment-${index}`,
          mega_test_id: testId,
          task_id: taskId,
          assigned_at: assigned.toISOString(),
        });
    }
    await db.collection("mega_access_task_attempts").doc("attempt-0").set({
      id: "attempt-0",
      user_id: uid,
      assignment_id: "assignment-0",
      status: "completed",
      completed_at: completed,
    });

    await assert.rejects(
      runFirestoreRpc(db, "register_free_mega_test", {
        p_mega_test_id: testId,
        p_user_id: uid,
      }),
      /Complete every assigned Mega Test task/,
    );

    await db.collection("mega_access_task_attempts").doc("attempt-1").set({
      id: "attempt-1",
      user_id: uid,
      assignment_id: "assignment-1",
      status: "completed",
      completed_at: completed,
    });
    const first = await runFirestoreRpc(db, "register_free_mega_test", {
      p_mega_test_id: testId,
      p_user_id: uid,
    });
    const second = await runFirestoreRpc(db, "register_free_mega_test", {
      p_mega_test_id: testId,
      p_user_id: uid,
    });
    assert.equal(first[0].registered, true);
    assert.equal(second[0].already_registered, true);
    assert.equal((await db.collection("mega_test_entries").get()).size, 1);
  });

  test("only rank one receives exactly one seven-day Pro award", async () => {
    const { runFirestoreRpc } = await import("../src/integrations/firebase/rpc.server");
    const { getFirebaseAdminDb } = await import("../src/integrations/firebase/admin.server");
    const db = await getFirebaseAdminDb();
    const testId = "44444444-4444-4444-8444-444444444444";
    const winner = "winner-firebase-uid";
    const runnerUp = "runner-up-firebase-uid";
    await db
      .collection("mega_tests")
      .doc(testId)
      .set({
        id: testId,
        scheduled_end: new Date(Date.now() - 60_000).toISOString(),
      });
    await Promise.all([
      db.collection("users").doc(winner).set({ id: winner, is_pro: false, pro_until: null }),
      db.collection("users").doc(runnerUp).set({ id: runnerUp, is_pro: false, pro_until: null }),
      db.collection("mega_test_entries").doc("winner-entry").set({
        id: "winner-entry",
        mega_test_id: testId,
        user_id: winner,
        access_verified_at: new Date().toISOString(),
        score: 100,
        rank: null,
      }),
      db.collection("mega_test_entries").doc("runner-entry").set({
        id: "runner-entry",
        mega_test_id: testId,
        user_id: runnerUp,
        access_verified_at: new Date().toISOString(),
        score: 90,
        rank: null,
      }),
    ]);

    await runFirestoreRpc(db, "record_mega_test_rank", { p_entry_id: "runner-entry", p_rank: 2 });
    const beforeWinner = Date.now();
    await runFirestoreRpc(db, "record_mega_test_rank", { p_entry_id: "winner-entry", p_rank: 1 });
    const duplicate = await runFirestoreRpc(db, "record_mega_test_rank", {
      p_entry_id: "winner-entry",
      p_rank: 1,
    });

    const winnerDoc = await db.collection("users").doc(winner).get();
    const runnerDoc = await db.collection("users").doc(runnerUp).get();
    const proUntil = Date.parse(String(winnerDoc.data()?.pro_until));
    assert.equal(winnerDoc.data()?.is_pro, true);
    assert.equal(runnerDoc.data()?.is_pro, false);
    assert.ok(proUntil >= beforeWinner + 7 * 86_400_000 - 2_000);
    assert.ok(proUntil <= Date.now() + 7 * 86_400_000 + 2_000);
    assert.equal(duplicate[0].duplicate, true);
    assert.equal(
      (await db.collection("notifications").where("kind", "==", "mega_first_prize").get()).size,
      1,
    );
  });
});
