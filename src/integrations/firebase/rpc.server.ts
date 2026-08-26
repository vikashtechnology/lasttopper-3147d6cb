import { createHash, randomUUID } from "node:crypto";
import type {
  DocumentData,
  DocumentReference,
  Firestore,
  Query,
  Transaction,
} from "firebase-admin/firestore";

type Row = Record<string, any>;

const isoNow = () => new Date().toISOString();
const asDate = (value: unknown) => {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate(): Date }).toDate();
  }
  return new Date(String(value));
};
const millis = (value: unknown) => asDate(value).getTime();
function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const hashId = (...values: unknown[]) => {
  const bytes = Buffer.from(
    createHash("sha256")
      .update(values.map((value) => JSON.stringify(value)).join("\u0000"))
      .digest("hex")
      .slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const rowFromSnapshot = (snapshot: { id: string; data(): DocumentData | undefined }) =>
  ({
    ...snapshot.data(),
    id: snapshot.id,
  }) as Row;
const created = (input: Row, id = String(input.id ?? randomUUID())) => {
  const now = isoNow();
  return { id, created_at: input.created_at ?? now, updated_at: input.updated_at ?? now, ...input };
};

async function getRow(transaction: Transaction, reference: DocumentReference) {
  const snapshot = await transaction.get(reference);
  return snapshot.exists ? rowFromSnapshot(snapshot) : null;
}

async function queryRows(
  transaction: Transaction,
  query: Query,
  predicate: (row: Row) => boolean = () => true,
) {
  const snapshot = await transaction.get(query);
  return snapshot.docs.map(rowFromSnapshot).filter(predicate);
}

async function queryBy(
  transaction: Transaction,
  db: Firestore,
  table: string,
  field: string,
  value: unknown,
  predicate: (row: Row) => boolean = () => true,
) {
  return queryRows(transaction, db.collection(table).where(field, "==", value), predicate);
}

function scoreQuestions(questions: unknown, answers: unknown) {
  must(Array.isArray(questions), "question paper is unavailable");
  must(answers && typeof answers === "object" && !Array.isArray(answers), "invalid answers");
  const answerMap = answers as Record<string, unknown>;
  let correct = 0;
  for (const question of questions as Row[]) {
    const id = question?.id;
    if (
      id != null &&
      id in answerMap &&
      String(answerMap[String(id)]) === String(question.correct)
    ) {
      correct += 1;
    }
  }
  return { correct, total: questions.length };
}

function tierFor(xp: number) {
  if (xp >= 100_000) return "diamond";
  if (xp >= 10_000) return "platinum";
  if (xp >= 1_000) return "gold";
  if (xp >= 100) return "silver";
  return "bronze";
}

function calculateXp(before: number, correctCount: number, boost: number) {
  let after = Math.max(0, before);
  let gained = 0;
  for (let index = 0; index < correctCount; index += 1) {
    const multiplier =
      after >= 100_000 ? 16 : after >= 10_000 ? 8 : after >= 1_000 ? 4 : after >= 100 ? 2 : 1;
    const increment = 10 * multiplier * boost;
    gained += increment;
    after += increment;
  }
  return { after, gained };
}

type XpInput = {
  userId: string;
  correctCount: number;
  sourceType: string;
  sourceId: string;
  sourceVersion: number;
};

async function readXpState(transaction: Transaction, db: Firestore, input: XpInput) {
  must(
    ["battle", "daily_challenge", "quiz_session", "review"].includes(input.sourceType),
    "Invalid XP source",
  );
  must(
    Number.isInteger(input.correctCount) && input.correctCount >= 0 && input.correctCount <= 200,
    "Invalid correct count",
  );
  must(
    Number.isInteger(input.sourceVersion) && input.sourceVersion > 0,
    "Invalid XP source version",
  );
  const userRef = db.collection("users").doc(input.userId);
  const awardId = hashId(input.userId, input.sourceType, input.sourceId, input.sourceVersion);
  const awardRef = db.collection("question_xp_awards").doc(awardId);
  const [user, award] = await Promise.all([
    getRow(transaction, userRef),
    getRow(transaction, awardRef),
  ]);
  must(user, "User not found");
  return { userRef, awardRef, user, award };
}

function applyXp(
  transaction: Transaction,
  state: Awaited<ReturnType<typeof readXpState>>,
  input: XpInput,
) {
  const before = Math.max(0, Number(state.user.reputation ?? 0));
  const boost = state.user.is_pro ? 2 : 1;
  if (state.award) {
    return { gained: 0, xp: before, boost, tier_up: false, tier: tierFor(before), awarded: false };
  }
  const { after, gained } = calculateXp(before, input.correctCount, boost);
  const now = isoNow();
  transaction.update(state.userRef, { reputation: after, updated_at: now });
  transaction.create(
    state.awardRef,
    created(
      {
        user_id: input.userId,
        source_type: input.sourceType,
        source_id: input.sourceId,
        source_version: input.sourceVersion,
        correct_count: input.correctCount,
        xp_gained: gained,
        xp_after: after,
      },
      state.awardRef.id,
    ),
  );
  return {
    gained,
    xp: after,
    boost,
    tier_up: tierFor(before) !== tierFor(after),
    tier: tierFor(after),
    awarded: true,
  };
}

async function hasRole(db: Firestore, args: Row) {
  const userId = String(args._user_id ?? "");
  const role = String(args._role ?? "");
  if (!userId || !role) return false;
  const snapshot = await db.collection("user_roles").where("user_id", "==", userId).get();
  return snapshot.docs.some((doc) => doc.data().role === role);
}

async function awardQuestionXp(db: Firestore, args: Row) {
  const input: XpInput = {
    userId: String(args.p_user_id ?? ""),
    correctCount: Number(args.p_correct_count),
    sourceType: String(args.p_source_type ?? ""),
    sourceId: String(args.p_source_id ?? ""),
    sourceVersion: Number(args.p_source_version ?? 1),
  };
  return db.runTransaction(async (transaction) => {
    const state = await readXpState(transaction, db, input);
    return [applyXp(transaction, state, input)];
  });
}

async function submitBattleResult(db: Firestore, args: Row) {
  const sessionId = String(args.p_session_id ?? "");
  const userId = String(args.p_user_id ?? "");
  return db.runTransaction(async (transaction) => {
    const sessionRef = db.collection("battle_sessions").doc(sessionId);
    const session = await getRow(transaction, sessionRef);
    must(session && session.user_id === userId, "battle session not found");
    const result = scoreQuestions(session.questions, args.p_answers);
    if (session.submitted_at) {
      return [
        {
          submitted: false,
          already_submitted: true,
          score: Number(session.score ?? 0),
          correct_count: Number(session.correct_count ?? 0),
          total: result.total,
          time_taken_seconds: Number(session.time_taken_seconds ?? 0),
        },
      ];
    }

    let test: Row | null = null;
    let entry: Row | null = null;
    let entryRef: DocumentReference | null = null;
    if (session.mode === "mega") {
      test = await getRow(
        transaction,
        db.collection("mega_tests").doc(String(session.mega_test_id)),
      );
      const now = Date.now();
      must(
        test &&
          !["completed", "cancelled"].includes(test.status) &&
          now >= millis(test.scheduled_start) &&
          now < millis(test.scheduled_end),
        "Mega Test submission window closed",
      );
      const entries = await queryBy(
        transaction,
        db,
        "mega_test_entries",
        "user_id",
        userId,
        (row) =>
          row.mega_test_id === session.mega_test_id &&
          row.session_id === sessionId &&
          !!row.access_verified_at,
      );
      entry = entries[0] ?? null;
      must(entry, "linked Mega Test entry not found");
      entryRef = db.collection("mega_test_entries").doc(entry.id);
    } else {
      must(["quick", "1v1"].includes(session.mode), "invalid battle mode");
    }

    const timeTaken = Math.max(
      0,
      Math.floor((Date.now() - millis(session.start_time ?? session.created_at)) / 1000),
    );
    const score = result.correct * 10;
    const now = isoNow();
    transaction.update(sessionRef, {
      answers: args.p_answers,
      score,
      correct_count: result.correct,
      time_taken_seconds: timeTaken,
      submitted_at: now,
      updated_at: now,
    });
    if (entryRef)
      transaction.update(entryRef, { score, correct_count: result.correct, updated_at: now });
    return [
      {
        submitted: true,
        already_submitted: false,
        score,
        correct_count: result.correct,
        total: result.total,
        time_taken_seconds: timeTaken,
      },
    ];
  });
}

function indiaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function completeDailyChallenge(db: Firestore, args: Row) {
  const challengeId = String(args.p_challenge_id ?? "");
  const userId = String(args.p_user_id ?? "");
  const attemptId = hashId("daily", challengeId, userId);
  return db.runTransaction(async (transaction) => {
    const challenge = await getRow(transaction, db.collection("daily_challenges").doc(challengeId));
    must(challenge && challenge.challenge_date === indiaDate(), "daily challenge unavailable");
    const user = await getRow(transaction, db.collection("users").doc(userId));
    must(user && user.profession === challenge.profession, "daily challenge user is ineligible");
    const attemptRef = db.collection("daily_challenge_attempts").doc(attemptId);
    const attempt = await getRow(transaction, attemptRef);
    if (attempt?.completed_at) {
      return [
        {
          submitted: false,
          already_submitted: true,
          correct_count: Number(attempt.correct_count ?? 0),
          total: Number(attempt.total_count ?? 0),
        },
      ];
    }
    const scored = scoreQuestions(challenge.questions, args.p_answers);
    const now = isoNow();
    transaction.set(
      attemptRef,
      created(
        {
          challenge_id: challengeId,
          user_id: userId,
          correct_count: scored.correct,
          total_count: scored.total,
          completed_at: now,
        },
        attemptId,
      ),
    );
    return [
      {
        submitted: true,
        already_submitted: false,
        correct_count: scored.correct,
        total: scored.total,
      },
    ];
  });
}

async function registerMegaTest(db: Firestore, args: Row) {
  const testId = String(args.p_mega_test_id ?? "");
  const userId = String(args.p_user_id ?? "");
  const entryId = hashId("mega-entry", testId, userId);
  return db.runTransaction(async (transaction) => {
    const [test, user, entry] = await Promise.all([
      getRow(transaction, db.collection("mega_tests").doc(testId)),
      getRow(transaction, db.collection("users").doc(userId)),
      getRow(transaction, db.collection("mega_test_entries").doc(entryId)),
    ]);
    must(test, "Mega Test not found");
    must(
      test.status === "scheduled" && Date.now() < millis(test.scheduled_start),
      "Mega Test registration closed",
    );
    must(user && user.profession === test.profession, "student is not eligible for this Mega Test");
    const assignments = await queryBy(
      transaction,
      db,
      "mega_access_task_assignments",
      "mega_test_id",
      testId,
    );
    must(
      assignments.length > 0,
      "Mega Test registration is locked until an admin assigns access tasks",
    );
    const taskRows = await Promise.all(
      assignments.map((assignment) =>
        getRow(transaction, db.collection("mega_access_tasks").doc(String(assignment.task_id))),
      ),
    );
    const attempts = await queryBy(transaction, db, "mega_access_task_attempts", "user_id", userId);
    const complete = assignments.every((assignment, index) => {
      const task = taskRows[index];
      return (
        !!task?.is_active &&
        attempts.some(
          (attempt) =>
            attempt.assignment_id === assignment.id &&
            attempt.status === "completed" &&
            millis(attempt.completed_at) >= millis(assignment.assigned_at) &&
            millis(attempt.completed_at) < millis(test.scheduled_start),
        )
      );
    });
    must(complete, "Complete every assigned Mega Test task before registering");
    if (entry?.access_verified_at) return [{ registered: false, already_registered: true }];
    const now = isoNow();
    transaction.set(
      db.collection("mega_test_entries").doc(entryId),
      entry
        ? { ...entry, access_verified_at: now, updated_at: now }
        : created(
            {
              mega_test_id: testId,
              user_id: userId,
              access_verified_at: now,
              session_id: null,
              score: null,
              correct_count: null,
              rank: null,
              pro_prize_awarded_at: null,
            },
            entryId,
          ),
    );
    return [{ registered: true, already_registered: false }];
  });
}

async function startMegaSession(db: Firestore, args: Row) {
  const testId = String(args.p_mega_test_id ?? "");
  const userId = String(args.p_user_id ?? "");
  const entryId = hashId("mega-entry", testId, userId);
  return db.runTransaction(async (transaction) => {
    const [entry, test] = await Promise.all([
      getRow(transaction, db.collection("mega_test_entries").doc(entryId)),
      getRow(transaction, db.collection("mega_tests").doc(testId)),
    ]);
    must(entry?.access_verified_at, "Mega Test registration not found");
    const nowMs = Date.now();
    must(
      test &&
        !["completed", "cancelled"].includes(test.status) &&
        nowMs >= millis(test.scheduled_start) &&
        nowMs < millis(test.scheduled_end),
      "Mega Test is not live",
    );
    must(
      Array.isArray(test.questions) &&
        test.questions.length > 0 &&
        test.questions.length === Number(test.question_count),
      "Mega Test questions are unavailable or incomplete",
    );
    const assignments = await queryBy(
      transaction,
      db,
      "mega_access_task_assignments",
      "mega_test_id",
      testId,
    );
    const taskRows = await Promise.all(
      assignments.map((assignment) =>
        getRow(transaction, db.collection("mega_access_tasks").doc(String(assignment.task_id))),
      ),
    );
    const attempts = await queryBy(transaction, db, "mega_access_task_attempts", "user_id", userId);
    const complete =
      assignments.length > 0 &&
      assignments.every((assignment, index) => {
        const task = taskRows[index];
        return (
          !!task?.is_active &&
          attempts.some(
            (attempt) =>
              attempt.assignment_id === assignment.id &&
              attempt.status === "completed" &&
              millis(attempt.completed_at) >= millis(assignment.assigned_at) &&
              millis(attempt.completed_at) < millis(test.scheduled_start),
          )
        );
      });
    must(complete, "Mega Test access tasks are incomplete");
    if (entry.session_id) return [{ session_id: entry.session_id, existing: true }];
    const sessionId = randomUUID();
    const now = isoNow();
    transaction.create(
      db.collection("battle_sessions").doc(sessionId),
      created(
        {
          user_id: userId,
          mode: "mega",
          profession: test.profession,
          mega_test_id: testId,
          questions: test.questions,
          answers: {},
          start_time: now,
          submitted_at: null,
          score: null,
          correct_count: null,
          time_taken_seconds: null,
        },
        sessionId,
      ),
    );
    transaction.update(db.collection("mega_test_entries").doc(entryId), {
      session_id: sessionId,
      updated_at: now,
    });
    return [{ session_id: sessionId, existing: false }];
  });
}

async function submitQuizSession(db: Firestore, args: Row) {
  const sessionId = String(args.p_session_id ?? "");
  const userId = String(args.p_user_id ?? "");
  const answers = args.p_answers;
  must(answers && typeof answers === "object" && !Array.isArray(answers), "Invalid answers");
  must(Object.keys(answers).length <= 200, "Too many answers");
  return db.runTransaction(async (transaction) => {
    const sessionRef = db.collection("quiz_sessions").doc(sessionId);
    const session = await getRow(transaction, sessionRef);
    must(session && session.user_id === userId, "Quiz session not found");
    const scored = scoreQuestions(session.questions, answers);
    must(
      scored.total > 0 &&
        scored.total <= 200 &&
        scored.total >= Number(session.question_count ?? scored.total),
      "Quiz paper is not ready",
    );
    const xpInput: XpInput = {
      userId,
      correctCount: Number(session.submitted_at ? (session.correct_count ?? 0) : scored.correct),
      sourceType: "quiz_session",
      sourceId: sessionId,
      sourceVersion: 1,
    };
    const xpState = session.xp_eligible ? await readXpState(transaction, db, xpInput) : null;
    if (session.submitted_at) {
      const xp = xpState ? applyXp(transaction, xpState, xpInput) : { gained: 0, xp: 0 };
      return [
        {
          submitted: false,
          correct_count: Number(session.correct_count ?? 0),
          incorrect_count: Number(
            session.incorrect_count ?? scored.total - Number(session.correct_count ?? 0),
          ),
          total: scored.total,
          accuracy: Number(session.accuracy ?? 0),
          elapsed_seconds: Number(session.time_taken_seconds ?? 0),
          xp_eligible: !!session.xp_eligible,
          xp_gained: xp.gained,
          xp_total: xp.xp,
        },
      ];
    }
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - millis(session.start_time ?? session.created_at)) / 1000),
    );
    if (session.timer_enabled && session.duration_seconds != null && !args.p_allow_late) {
      must(
        Date.now() <= millis(session.start_time) + (Number(session.duration_seconds) + 15) * 1000,
        "Quiz deadline has passed",
      );
    }
    const cappedElapsed =
      session.timer_enabled && session.duration_seconds != null
        ? Math.min(elapsed, Number(session.duration_seconds))
        : elapsed;
    const incorrect = scored.total - scored.correct;
    const accuracy = Math.round((scored.correct / scored.total) * 10_000) / 100;
    const now = isoNow();
    transaction.update(sessionRef, {
      answers,
      score: scored.correct,
      correct_count: scored.correct,
      incorrect_count: incorrect,
      accuracy,
      time_taken_seconds: cappedElapsed,
      submitted_at: now,
      last_heartbeat: now,
      was_auto_submitted: !!args.p_allow_late,
      updated_at: now,
    });
    const xp = xpState ? applyXp(transaction, xpState, xpInput) : { gained: 0, xp: 0 };
    return [
      {
        submitted: true,
        correct_count: scored.correct,
        incorrect_count: incorrect,
        total: scored.total,
        accuracy,
        elapsed_seconds: cappedElapsed,
        xp_eligible: !!session.xp_eligible,
        xp_gained: xp.gained,
        xp_total: xp.xp,
      },
    ];
  });
}

async function gradeReviewItem(db: Firestore, args: Row) {
  const itemId = String(args.p_item_id ?? "");
  const userId = String(args.p_user_id ?? "");
  const correct = !!args.p_correct;
  return db.runTransaction(async (transaction) => {
    const itemRef = db.collection("review_items").doc(itemId);
    const item = await getRow(transaction, itemRef);
    must(
      item && item.user_id === userId && millis(item.due_at) <= Date.now(),
      "Review item is not due",
    );
    const version = Number(item.reviewed_count ?? 0) + 1;
    const box = correct ? Math.min(5, Number(item.box ?? 1) + 1) : 1;
    const days = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 }[box as 1 | 2 | 3 | 4 | 5];
    const dueAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const xpInput: XpInput = {
      userId,
      correctCount: 1,
      sourceType: "review",
      sourceId: itemId,
      sourceVersion: version,
    };
    const xpState = correct ? await readXpState(transaction, db, xpInput) : null;
    const retired = correct && box >= 5;
    if (retired) transaction.delete(itemRef);
    else
      transaction.update(itemRef, {
        box,
        due_at: dueAt,
        last_result: correct ? "correct" : "wrong",
        reviewed_count: version,
        updated_at: isoNow(),
      });
    const xp = xpState ? applyXp(transaction, xpState, xpInput) : { gained: 0, xp: 0 };
    return [{ retired, box, due_at: dueAt, xp_gained: xp.gained, xp_total: xp.xp }];
  });
}

async function fulfillProPayment(db: Firestore, args: Row) {
  const paymentId = String(args.p_payment_id ?? "");
  const orderId = String(args.p_order_id ?? "");
  const userId = String(args.p_user_id ?? "");
  const purpose = String(args.p_purpose ?? "");
  const amount = Number(args.p_amount_paise);
  const plans: Record<string, { days: number; amount: number }> = {
    pro_weekly: { days: 7, amount: 4_900 },
    pro: { days: 30, amount: 14_900 },
    pro_yearly: { days: 365, amount: 149_900 },
  };
  const plan = plans[purpose];
  must(
    paymentId.length >= 1 &&
      paymentId.length <= 100 &&
      orderId.length >= 1 &&
      orderId.length <= 100,
    "invalid payment fulfillment data",
  );
  must(plan && amount === plan.amount, "invalid Pro pass amount");
  return db.runTransaction(async (transaction) => {
    const paymentKeyRef = db
      .collection("idempotency_keys")
      .doc(hashId("razorpay-payment", paymentId));
    const orderKeyRef = db.collection("idempotency_keys").doc(hashId("razorpay-order", orderId));
    const userRef = db.collection("users").doc(userId);
    const [paymentKey, orderKey, user] = await Promise.all([
      getRow(transaction, paymentKeyRef),
      getRow(transaction, orderKeyRef),
      getRow(transaction, userRef),
    ]);
    must(user, "payment user not found");
    const expected = {
      payment_id: paymentId,
      order_id: orderId,
      user_id: userId,
      purpose,
      amount_paise: amount,
    };
    const existing = paymentKey?.payload ?? orderKey?.payload;
    if (existing) {
      must(
        Object.entries(expected).every(([key, value]) => existing[key] === value),
        "payment replay data mismatch",
      );
      return [{ fulfilled: true, already_fulfilled: true, pro_until: user.pro_until }];
    }
    const base = Math.max(Date.now(), user.pro_until ? millis(user.pro_until) : Date.now());
    const proUntil = new Date(base + plan.days * 86_400_000).toISOString();
    const now = isoNow();
    transaction.update(userRef, {
      is_pro: true,
      pro_since: user.pro_since ?? now,
      pro_until: proUntil,
      updated_at: now,
    });
    const payload = created({ kind: "razorpay_pro", payload: expected }, paymentKeyRef.id);
    transaction.create(paymentKeyRef, payload);
    transaction.create(orderKeyRef, { ...payload, id: orderKeyRef.id });
    transaction.create(
      db.collection("pro_payment_fulfillments").doc(hashId(paymentId)),
      created(expected, hashId(paymentId)),
    );
    return [{ fulfilled: true, already_fulfilled: false, pro_until: proUntil }];
  });
}

async function recordMegaRank(db: Firestore, args: Row) {
  const entryId = String(args.p_entry_id ?? "");
  const rank = Number(args.p_rank);
  must(Number.isInteger(rank) && rank >= 1, "invalid Mega Test rank");
  return db.runTransaction(async (transaction) => {
    const entryRef = db.collection("mega_test_entries").doc(entryId);
    const entry = await getRow(transaction, entryRef);
    must(
      entry?.access_verified_at && entry.score != null,
      "eligible submitted Mega Test entry not found",
    );
    const test = await getRow(
      transaction,
      db.collection("mega_tests").doc(String(entry.mega_test_id)),
    );
    must(test && Date.now() >= millis(test.scheduled_end), "Mega Test has not ended");
    if (entry.rank != null) {
      must(Number(entry.rank) === rank, "Mega Test rank was already finalized");
      return [{ recorded: false, duplicate: true }];
    }
    const now = isoNow();
    if (rank !== 1) {
      transaction.update(entryRef, { rank, updated_at: now });
      return [{ recorded: true, duplicate: false }];
    }
    const rankLockRef = db
      .collection("idempotency_keys")
      .doc(hashId("mega-first", entry.mega_test_id));
    const rankLock = await getRow(transaction, rankLockRef);
    must(!rankLock || rankLock.entry_id === entryId, "Mega Test first place already exists");
    const userRef = db.collection("users").doc(String(entry.user_id));
    const user = await getRow(transaction, userRef);
    must(user, "Mega Test winner profile not found");
    const base = Math.max(Date.now(), user.pro_until ? millis(user.pro_until) : Date.now());
    const proUntil = new Date(base + 7 * 86_400_000).toISOString();
    transaction.update(userRef, {
      is_pro: true,
      pro_since: user.pro_since ?? now,
      pro_until: proUntil,
      updated_at: now,
    });
    transaction.update(entryRef, { rank: 1, pro_prize_awarded_at: now, updated_at: now });
    if (!rankLock)
      transaction.create(
        rankLockRef,
        created({ kind: "mega_first", entry_id: entryId }, rankLockRef.id),
      );
    const notificationId = hashId("mega-first-notification", entryId);
    transaction.set(
      db.collection("notifications").doc(notificationId),
      created(
        {
          user_id: entry.user_id,
          kind: "mega_first_prize",
          title: "You won the Sunday Mega Test",
          body: "First prize awarded: your Pro access was extended by 7 days.",
          link: "/battle/mega",
          read_at: null,
        },
        notificationId,
      ),
      { merge: false },
    );
    return [{ recorded: true, duplicate: false }];
  });
}

async function completeProviderAttempt(db: Firestore, args: Row) {
  const attemptId = String(args.p_attempt_id ?? "");
  const nonce = String(args.p_nonce ?? "");
  const provider = String(args.p_provider ?? "");
  const transactionId = String(args.p_transaction_id ?? "").trim();
  must(transactionId.length >= 1 && transactionId.length <= 300, "invalid provider transaction id");
  return db.runTransaction(async (transaction) => {
    const attemptRef = db.collection("mega_access_task_attempts").doc(attemptId);
    const transactionKeyRef = db
      .collection("idempotency_keys")
      .doc(hashId("provider", provider, transactionId));
    const [attempt, transactionKey] = await Promise.all([
      getRow(transaction, attemptRef),
      getRow(transaction, transactionKeyRef),
    ]);
    must(attempt, "task attempt not found");
    const assignment = await getRow(
      transaction,
      db.collection("mega_access_task_assignments").doc(String(attempt.assignment_id)),
    );
    must(assignment, "task assignment not found");
    const [task, test] = await Promise.all([
      getRow(transaction, db.collection("mega_access_tasks").doc(String(assignment.task_id))),
      getRow(transaction, db.collection("mega_tests").doc(String(assignment.mega_test_id))),
    ]);
    must(task, "task not found");
    must(test, "Mega Test not found");
    if (attempt.status === "completed") {
      must(
        attempt.nonce === nonce &&
          attempt.provider === provider &&
          attempt.provider_transaction_id === transactionId,
        "completed attempt does not match callback",
      );
      return [
        {
          completed: false,
          already_completed: true,
          user_id: attempt.user_id,
          mega_test_id: test.id,
          task_id: task.id,
        },
      ];
    }
    must(attempt.status === "pending", "task attempt is not pending");
    must(attempt.nonce === nonce, "task attempt nonce mismatch");
    must(attempt.provider === provider && task.provider === provider, "task provider mismatch");
    must(
      ["rewarded_ad", "external_link"].includes(task.task_type),
      "task does not accept provider callbacks",
    );
    if (task.task_type === "rewarded_ad") {
      must(
        args.p_provider_user_id === attempt.user_id &&
          args.p_provider_placement_id === task.provider_placement_id,
        "AdMob user or placement mismatch",
      );
    } else {
      must(
        args.p_provider_user_id == null && args.p_provider_placement_id == null,
        "unexpected external task callback identity",
      );
    }
    must(task.is_active, "task is inactive");
    must(
      test.status === "scheduled" && Date.now() < millis(test.scheduled_start),
      "Mega Test task deadline has passed",
    );
    if (Date.now() >= millis(attempt.expires_at)) {
      transaction.update(attemptRef, {
        status: "expired",
        rejection_reason: "attempt expired before verification",
        updated_at: isoNow(),
      });
      return [
        {
          completed: false,
          already_completed: false,
          user_id: attempt.user_id,
          mega_test_id: test.id,
          task_id: task.id,
        },
      ];
    }
    const providerTime = millis(args.p_provider_timestamp);
    must(
      Number.isFinite(providerTime) &&
        providerTime >= millis(attempt.created_at) - 5 * 60_000 &&
        providerTime <= Math.min(millis(attempt.expires_at), Date.now() + 5 * 60_000),
      "provider timestamp is outside the attempt window",
    );
    must(
      !transactionKey || transactionKey.attempt_id === attemptId,
      "provider transaction was already used",
    );
    const now = isoNow();
    transaction.update(attemptRef, {
      status: "completed",
      provider_transaction_id: transactionId,
      provider_timestamp: asDate(args.p_provider_timestamp).toISOString(),
      verified_at: now,
      completed_at: now,
      callback_payload: args.p_callback_payload ?? {},
      rejection_reason: null,
      updated_at: now,
    });
    if (!transactionKey)
      transaction.create(
        transactionKeyRef,
        created({ kind: "provider", attempt_id: attemptId }, transactionKeyRef.id),
      );
    return [
      {
        completed: true,
        already_completed: false,
        user_id: attempt.user_id,
        mega_test_id: test.id,
        task_id: task.id,
      },
    ];
  });
}

async function recordStudyCompletion(db: Firestore, args: Row) {
  const assignmentId = String(args.p_assignment_id ?? "");
  const userId = String(args.p_user_id ?? "");
  const completionLockRef = db
    .collection("idempotency_keys")
    .doc(hashId("study-completion", assignmentId, userId));
  return db.runTransaction(async (transaction) => {
    const [assignment, completionLock] = await Promise.all([
      getRow(transaction, db.collection("mega_access_task_assignments").doc(assignmentId)),
      getRow(transaction, completionLockRef),
    ]);
    must(assignment, "task assignment not found");
    if (completionLock) {
      return [
        {
          completed: false,
          already_completed: true,
          source_type: completionLock.source_type,
          source_id: completionLock.source_id,
        },
      ];
    }
    const [task, test, user] = await Promise.all([
      getRow(transaction, db.collection("mega_access_tasks").doc(String(assignment.task_id))),
      getRow(transaction, db.collection("mega_tests").doc(String(assignment.mega_test_id))),
      getRow(transaction, db.collection("users").doc(userId)),
    ]);
    must(
      task && task.is_active && ["daily_challenge", "quiz"].includes(task.task_type),
      "study task is not active",
    );
    must(
      test && test.status === "scheduled" && Date.now() < millis(test.scheduled_start),
      "Mega Test task deadline has passed",
    );
    must(user && user.profession === test.profession, "student is not eligible for this Mega Test");
    const existingAttempts = await queryBy(
      transaction,
      db,
      "mega_access_task_attempts",
      "user_id",
      userId,
    );
    const already = existingAttempts.find(
      (attempt) => attempt.assignment_id === assignmentId && attempt.status === "completed",
    );
    if (already) {
      return [
        {
          completed: false,
          already_completed: true,
          source_type: already.source_type,
          source_id: already.source_id,
        },
      ];
    }

    let source: Row | undefined;
    if (task.task_type === "daily_challenge") {
      const attempts = await queryBy(
        transaction,
        db,
        "daily_challenge_attempts",
        "user_id",
        userId,
      );
      const challenges = await Promise.all(
        attempts.map((attempt) =>
          getRow(transaction, db.collection("daily_challenges").doc(String(attempt.challenge_id))),
        ),
      );
      source = attempts
        .filter((attempt, index) => {
          const challenge = challenges[index];
          return (
            !!attempt.completed_at &&
            millis(attempt.completed_at) >= millis(assignment.assigned_at) &&
            millis(attempt.completed_at) < millis(test.scheduled_start) &&
            challenge?.profession === test.profession &&
            Number(attempt.total_count) >= Number(task.min_questions) &&
            (Number(attempt.correct_count) * 100) / Math.max(Number(attempt.total_count), 1) >=
              Number(task.min_score_percent) &&
            !existingAttempts.some(
              (used) =>
                used.status === "completed" &&
                used.source_type === "daily_challenge" &&
                used.source_id === attempt.id,
            )
          );
        })
        .sort((a, b) => millis(a.completed_at) - millis(b.completed_at))[0];
    } else {
      const sessions = await queryBy(transaction, db, "quiz_sessions", "user_id", userId);
      source = sessions
        .filter(
          (session) =>
            !!session.submitted_at &&
            millis(session.submitted_at) >= millis(assignment.assigned_at) &&
            millis(session.submitted_at) < millis(test.scheduled_start) &&
            session.xp_eligible === true &&
            Number(session.question_count) >= Number(task.min_questions) &&
            Number(session.accuracy ?? 0) >= Number(task.min_score_percent) &&
            !existingAttempts.some(
              (used) =>
                used.status === "completed" &&
                used.source_type === "quiz" &&
                used.source_id === session.id,
            ),
        )
        .sort((a, b) => millis(a.submitted_at) - millis(b.submitted_at))[0];
    }
    if (!source)
      return [
        {
          completed: false,
          already_completed: false,
          source_type: task.task_type,
          source_id: null,
        },
      ];

    const now = isoNow();
    for (const pending of existingAttempts.filter(
      (attempt) => attempt.assignment_id === assignmentId && attempt.status === "pending",
    )) {
      transaction.update(db.collection("mega_access_task_attempts").doc(pending.id), {
        status: "expired",
        rejection_reason: "replaced by verified study completion",
        updated_at: now,
      });
    }
    const attemptId = randomUUID();
    transaction.create(
      db.collection("mega_access_task_attempts").doc(attemptId),
      created(
        {
          assignment_id: assignmentId,
          user_id: userId,
          status: "completed",
          source_type: task.task_type,
          source_id: source.id,
          expires_at: test.scheduled_start,
          verified_at: now,
          completed_at: now,
        },
        attemptId,
      ),
    );
    transaction.create(
      completionLockRef,
      created(
        { kind: "study-completion", source_type: task.task_type, source_id: source.id },
        completionLockRef.id,
      ),
    );
    return [
      {
        completed: true,
        already_completed: false,
        source_type: task.task_type,
        source_id: source.id,
      },
    ];
  });
}

export async function runFirestoreRpc(db: Firestore, name: string, args: Row): Promise<any> {
  switch (name) {
    case "has_role":
      return hasRole(db, args);
    case "award_question_xp":
      return awardQuestionXp(db, args);
    case "submit_battle_result":
      return submitBattleResult(db, args);
    case "complete_daily_challenge":
      return completeDailyChallenge(db, args);
    case "register_free_mega_test":
      return registerMegaTest(db, args);
    case "start_mega_battle_session":
      return startMegaSession(db, args);
    case "submit_quiz_session":
      return submitQuizSession(db, args);
    case "grade_review_item":
      return gradeReviewItem(db, args);
    case "fulfill_pro_payment":
      return fulfillProPayment(db, args);
    case "record_mega_test_rank":
      return recordMegaRank(db, args);
    case "complete_mega_access_task_attempt":
      return completeProviderAttempt(db, args);
    case "record_mega_study_task_completion":
      return recordStudyCompletion(db, args);
    default:
      throw new Error(`Unsupported Firestore transaction: ${name}`);
  }
}
