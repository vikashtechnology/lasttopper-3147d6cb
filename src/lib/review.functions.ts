import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { QuizQuestion } from "@/lib/learning.functions";

export type ReviewItem = {
  id: string;
  question: QuizQuestion;
  box: number;
  due_at: string;
};

export const getReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ due: ReviewItem[]; total: number; dueCount: number }> => {
    const { upsertReviewItems } = await import("@/lib/review.server");

    // Sync recent mistakes into the queue.
    const { data: sessions } = await context.supabase
      .from("quiz_sessions")
      .select("questions, answers, submitted_at")
      .eq("user_id", context.userId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(20);
    const wrong: QuizQuestion[] = [];
    for (const s of sessions ?? []) {
      const qs = (s.questions as QuizQuestion[]) ?? [];
      const ans = (s.answers as Record<string, string>) ?? {};
      for (const q of qs) if (ans[q.id] !== q.correct) wrong.push(q);
    }
    if (wrong.length)
      await upsertReviewItems(context.supabase, context.userId, wrong.slice(0, 200));

    const nowIso = new Date().toISOString();
    const { data: due } = await context.supabase
      .from("review_items")
      .select("id, question, box, due_at")
      .eq("user_id", context.userId)
      .lte("due_at", nowIso)
      .order("due_at")
      .limit(20);
    const { count } = await context.supabase
      .from("review_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    const { count: dueCount } = await context.supabase
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), correct: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { BOX_DAYS } = await import("@/lib/review.server");
    const { assertQuota } = await import("@/lib/quota.server");
    await assertQuota(context.supabase, context.userId, 1);
    const { data: item } = await context.supabase
      .from("review_items")
      .select("box, reviewed_count")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!item) throw new Error("Review item not found");

    const box = data.correct ? Math.min(5, Number(item.box ?? 1) + 1) : 1;
    const dueAt = new Date(Date.now() + BOX_DAYS[box] * 24 * 60 * 60 * 1000).toISOString();

    if (data.correct) {
      const { awardQuestionXp } = await import("@/lib/xp.server");
      await awardQuestionXp(context.supabase, context.userId, 1).catch(() => null);
    }

    if (data.correct && box >= 5) {
      await context.supabase
        .from("review_items")
        .delete()
        .eq("id", data.id)
        .eq("user_id", context.userId);
      return { retired: true, box, due_at: dueAt };
    }

    await context.supabase
      .from("review_items")
      .update({
        box,
        due_at: dueAt,
        last_result: data.correct ? "correct" : "wrong",
        reviewed_count: Number(item.reviewed_count ?? 0) + 1,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { retired: false, box, due_at: dueAt };
  });
