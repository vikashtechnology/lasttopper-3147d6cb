import { z } from "zod";
import { aiChat } from "@/lib/ai-router";

type MegaQuestion = {
  id: string;
  chapter_id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct: "A" | "B" | "C" | "D";
  hint: string;
  explanation: string;
};

const generatedMegaQuestionSchema = z.object({
  question: z.string().trim().min(1).max(20_000),
  options: z.object({
    A: z.string().max(10_000),
    B: z.string().max(10_000),
    C: z.string().max(10_000),
    D: z.string().max(10_000),
  }),
  correct: z.enum(["A", "B", "C", "D"]),
  hint: z.string().max(10_000).default(""),
  explanation: z.string().max(20_000).default(""),
});

async function callGeminiMega(count: number, batchIdx: number): Promise<MegaQuestion[]> {
  const prompt = `Generate exactly ${count} NCERT-only exam-style MCQ covering ONLY Physics and Chemistry (Class 11 & 12). Mix chapters and difficulty (30/40/30). Use LaTeX ($...$ / $$...$$). This is batch #${batchIdx + 1}; produce a fresh unique set. Return STRICT JSON: {"questions":[{"question":"...","options":{"A":"","B":"","C":"","D":""},"correct":"A|B|C|D","hint":"...","explanation":"..."}]}`;
  try {
    const data = await aiChat({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are an NCERT-only exam question generator. Physics and Chemistry only. Output STRICT JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    const content: string = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = z
      .object({ questions: z.array(generatedMegaQuestionSchema).max(100) })
      .parse(JSON.parse(content));
    return parsed.questions.slice(0, count).map((q, i) => ({
      id: `mq_${Date.now()}_${batchIdx}_${i}`,
      chapter_id: "",
      question: q.question,
      options: q.options,
      correct: q.correct,
      hint: q.hint,
      explanation: q.explanation,
    }));
  } catch {
    return [];
  }
}

async function generateMegaQuestionSet(): Promise<MegaQuestion[]> {
  // 180 questions in 3 parallel batches of 60
  const parts = await Promise.all([
    callGeminiMega(60, 0),
    callGeminiMega(60, 1),
    callGeminiMega(60, 2),
  ]);
  const all = parts.flat().slice(0, 180);
  // Fill incomplete AI output only from Physics/Chemistry bank questions. Never
  // activate a partial paper: every participant must receive all 180 questions.
  if (all.length < 180) {
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    const { data, error } = await firestoreAdmin
      .from("question_bank")
      .select("id, chapter_id, question, options, correct, hint, explanation")
      .in("subject_code", ["physics_pcm", "physics_pcb", "chemistry_pcm", "chemistry_pcb"])
      .limit(500);
    if (error) throw error;
    const picked = [...(data ?? [])]
      .sort(() => Math.random() - 0.5)
      .flatMap((r, i) => {
        const parsed = generatedMegaQuestionSchema.safeParse(r);
        if (!parsed.success) return [];
        return [
          {
            id: `mq_bank_${Date.now()}_${i}`,
            chapter_id: r.chapter_id ?? "",
            ...parsed.data,
          },
        ];
      })
      .slice(0, 180 - all.length);
    all.push(...picked);
  }
  return all.length === 180 ? all : [];
}

export type MegaLifecycleResult = {
  skipped: boolean;
  results: Array<{ id: string; action: string }>;
};

let requestRecoveryNotBefore = 0;

/**
 * Request-triggered fallback for environments where scheduled GitHub jobs are
 * delayed. The process-local gate avoids a Firestore lease read on every page
 * request; the shared lease below coordinates separate serverless instances.
 */
export async function recoverMegaTestLifecycleIfDue() {
  const now = Date.now();
  if (now < requestRecoveryNotBefore) return;
  requestRecoveryNotBefore = now + 4 * 60 * 1000;
  try {
    await runMegaTestLifecycle();
  } catch (error) {
    requestRecoveryNotBefore = now + 60 * 1000;
    console.error("Mega Test request recovery failed", error);
  }
}

/**
 * Runs the idempotent Mega Test lifecycle. A Firestore lease prevents GitHub
 * Actions and request-triggered recovery from doing the same work concurrently.
 */
export async function runMegaTestLifecycle(): Promise<MegaLifecycleResult> {
  const { getFirebaseAdminDb } = await import("@/integrations/firebase/admin.server");
  const db = await getFirebaseAdminDb();
  const leaseRef = db.collection("system_locks").doc("mega_test_lifecycle");
  const leaseMs = 4 * 60 * 1000;
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(leaseRef);
    const nowMs = Date.now();
    if (Number(snapshot.data()?.next_run_at_ms ?? 0) > nowMs) return false;
    transaction.set(
      leaseRef,
      {
        id: "mega_test_lifecycle",
        next_run_at_ms: nowMs + leaseMs,
        claimed_at: new Date(nowMs).toISOString(),
      },
      { merge: true },
    );
    return true;
  });
  if (!claimed) return { skipped: true, results: [] };

  const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
  const now = new Date().toISOString();
  const { data: tests, error: testsError } = await firestoreAdmin
    .from("mega_tests")
    .select("id")
    .lt("scheduled_end", now)
    .in("status", ["scheduled", "live"]);
  if (testsError) throw testsError;

  const results: Array<{ id: string; action: string }> = [];
  for (const t of tests ?? []) {
    const { data: entries, error: entriesError } = await (firestoreAdmin as any)
      .from("mega_test_entries")
      .select("id, score, correct_count")
      .eq("mega_test_id", t.id)
      .not("access_verified_at", "is", null);
    if (entriesError) throw entriesError;
    const eligibleEntries: Array<{
      id: string;
      score: number | null;
      correct_count: number | null;
    }> = entries ?? [];

    const ranked = eligibleEntries
      .filter((e) => e.score !== null && e.score !== undefined)
      .sort(
        (a, b) =>
          b.score! - a.score! ||
          (b.correct_count ?? 0) - (a.correct_count ?? 0) ||
          a.id.localeCompare(b.id),
      );
    for (let i = 0; i < ranked.length; i += 1) {
      const rank = i + 1;
      const entry = ranked[i];
      // The service-only RPC persists rank atomically and awards the only
      // prize (seven days of Pro) when rank is exactly #1.
      const { error: rankError } = await (firestoreAdmin as any).rpc("record_mega_test_rank", {
        p_entry_id: entry.id,
        p_rank: rank,
      });
      if (rankError) throw rankError;
    }

    const { error: completeError } = await firestoreAdmin
      .from("mega_tests")
      .update({ status: "completed" })
      .eq("id", t.id);
    if (completeError) throw completeError;
    results.push({ id: t.id, action: "completed" });
  }

  // Auto-configure next Sunday's mega test.
  // Trigger window: any run after Sunday 14:00 IST (= 08:30 UTC) and before
  // the following Sunday 10:00 IST guarantees the row exists for the
  // upcoming Sunday 10:00 IST start (= 04:30 UTC), for both professions.
  const nowD = new Date();
  function nextSunday1000IST(from: Date): Date {
    for (let i = 0; i < 8; i += 1) {
      const c = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
      c.setUTCHours(4, 30, 0, 0);
      if (c.getUTCDay() === 0 && c.getTime() > from.getTime()) return c;
    }
    return from;
  }
  // Only pre-provision once the current Sunday's window is clearly over (>= 14:00 IST Sunday, or any later day).
  const isSunday = nowD.getUTCDay() === 0;
  const past2pmIST = nowD.getUTCHours() * 60 + nowD.getUTCMinutes() >= 8 * 60 + 30; // 08:30 UTC = 14:00 IST
  const shouldProvision = !isSunday || past2pmIST;
  if (shouldProvision) {
    const start = nextSunday1000IST(nowD);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    for (const profession of ["pcm", "pcb"] as const) {
      const { data: existing, error: existingError } = await firestoreAdmin
        .from("mega_tests")
        .select("id")
        .eq("profession", profession)
        .eq("scheduled_start", start.toISOString())
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        const { error: insertError } = await firestoreAdmin.from("mega_tests").upsert(
          {
            profession,
            scheduled_start: start.toISOString(),
            scheduled_end: end.toISOString(),
            status: "scheduled",
            min_participants: 50,
            question_count: 180,
          },
          { onConflict: "profession,scheduled_start", ignoreDuplicates: true },
        );
        if (insertError) throw insertError;
        results.push({ id: `${profession}-${start.toISOString()}`, action: "provisioned" });
      }
    }

    // Pre-generate ONE shared question set for the upcoming test (Physics + Chemistry
    // only — common to both PCM and PCB per product decision). Save it to both
    // profession rows so every joiner sees the exact same paper.
    const { data: rows, error: rowsError } = await firestoreAdmin
      .from("mega_tests")
      .select("id, questions")
      .eq("scheduled_start", start.toISOString());
    if (rowsError) throw rowsError;
    const needsGen = (rows ?? []).some(
      (r) => !r.questions || (r.questions as unknown[]).length === 0,
    );
    // Only build the paper within 24h of the scheduled start (fresher questions,
    // and avoids burning AI credits a week early).
    const within24h = start.getTime() - nowD.getTime() <= 24 * 60 * 60 * 1000;
    if (needsGen && within24h) {
      const questions = await generateMegaQuestionSet();
      if (questions.length === 180) {
        for (const r of rows ?? []) {
          const { error: questionsError } = await firestoreAdmin
            .from("mega_tests")
            .update({ questions: questions as unknown as never })
            .eq("id", r.id);
          if (questionsError) throw questionsError;
        }
        results.push({
          id: `mega-questions-${start.toISOString()}`,
          action: `generated-${questions.length}`,
        });
      }
    }
  }

  return { skipped: false, results };
}
