import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import type { QuizQuestion } from "@/lib/learning.functions";

export type ReviewItem = {
  id: string;
  question: QuizQuestion;
  box: number;
  due_at: string;
};

export const getReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<{ due: ReviewItem[]; total: number; dueCount: number }> => {
    const { upsertReviewItems } = await import("@/lib/review.server");
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");

    // Sync recent mistakes into the queue.
    const { data: sessions, error: sessionsError } = await firestoreAdmin
      .from("quiz_sessions")
      .select("questions, answers, submitted_at")
      .eq("user_id", context.userId)
      .eq("xp_eligible", true)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(20);
    if (sessionsError) throw sessionsError;
    const wrong: QuizQuestion[] = [];
    for (const s of sessions ?? []) {
      const qs = (s.questions as QuizQuestion[]) ?? [];
      const ans = (s.answers as Record<string, string>) ?? {};
      for (const q of qs) if (ans[q.id] !== q.correct) wrong.push(q);
    }
    if (wrong.length) await upsertReviewItems(firestoreAdmin, context.userId, wrong.slice(0, 200));

    const nowIso = new Date().toISOString();
    const { data: due } = await context.db
      .from("review_items")
      .select("id, question, box, due_at")
      .eq("user_id", context.userId)
      .lte("due_at", nowIso)
      .order("due_at")
      .limit(20);
    const { count } = await context.db
      .from("review_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    const { count: dueCount } = await context.db
      .from("review_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .lte("due_at", nowIso);

    return {
      due: (due ?? []).map((r) => ({
        id: r.id as string,
        question: r.question as unknown as QuizQuestion,
        box: Number(r.box ?? 1),
        due_at: r.due_at as string,
      })),
      total: count ?? 0,
      dueCount: dueCount ?? 0,
    };
  });

export const gradeReview = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), correct: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertQuota } = await import("@/lib/quota.server");
    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    await assertQuota(context.db, context.userId, 1);

    const { data: resultData, error } = await (firestoreAdmin as any).rpc("grade_review_item", {
      p_item_id: data.id,
      p_user_id: context.userId,
      p_correct: data.correct,
    });
    if (error) throw error;
    const result = Array.isArray(resultData) ? resultData[0] : resultData;
    if (!result) throw new Error("Review could not be graded");

    return {
      retired: !!result.retired,
      box: Number(result.box),
      due_at: String(result.due_at),
      xp_gained: Number(result.xp_gained ?? 0),
      xp_total: Number(result.xp_total ?? 0),
    };
  });
