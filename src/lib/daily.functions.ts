import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { QuizQuestion } from "@/lib/learning.functions";
import type { BattleQuestion } from "@/lib/battle.functions";

export type DailyChallengeView = {
  id: string;
  date: string;
  questions: BattleQuestion[];
  attempted: boolean;
  correct_count: number;
  locked: boolean;
  quota_used: number;
  quota_limit: number;
};

export const getDailyChallenge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DailyChallengeView> => {
    const { ensureDailyChallenge, todayKey } = await import("@/lib/daily.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileError } = await context.supabase
      .from("users")
      .select("profession")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    const profession = profile?.profession as "pcm" | "pcb" | null;
    if (!profession) throw new Error("Complete onboarding first");

    const ch = await ensureDailyChallenge(supabaseAdmin, supabaseAdmin, profession);
    const { data: attempt, error: attemptError } = await context.supabase
      .from("daily_challenge_attempts")
      .select("correct_count, completed_at")
      .eq("challenge_id", ch.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (attemptError) throw attemptError;

    const { getQuotaState } = await import("@/lib/quota.server");
    const quota = await getQuotaState(context.supabase, context.userId);
    const locked =
      !attempt?.completed_at && !quota.is_pro && quota.remaining < (ch.questions ?? []).length;

    return {
      locked,
      quota_used: quota.used,
      quota_limit: quota.limit,
      id: ch.id,
      date: todayKey(),
      questions: ch.questions.map(
        ({ correct: _correct, hint: _hint, explanation: _explanation, ...question }) => question,
      ),
      attempted: !!attempt?.completed_at,
      correct_count: Number(attempt?.correct_count ?? 0),
    };
  });

export const submitDailyChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        challenge_id: z.string().uuid(),
        answers: z
          .record(z.string().max(128), z.enum(["A", "B", "C", "D"]))
          .refine((answers) => Object.keys(answers).length <= 20, "Too many answers"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ch, error: challengeError } = await supabaseAdmin
      .from("daily_challenges")
      .select("id, questions")
      .eq("id", data.challenge_id)
      .maybeSingle();
    if (challengeError) throw challengeError;
    if (!ch) throw new Error("Challenge not found");

    const questions = (ch.questions as QuizQuestion[]) ?? [];
    const { data: prior, error: priorError } = await context.supabase
      .from("daily_challenge_attempts")
      .select("completed_at")
      .eq("challenge_id", ch.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (priorError) throw priorError;
    if (!prior?.completed_at) {
      const { assertQuota } = await import("@/lib/quota.server");
      await assertQuota(context.supabase, context.userId, questions.length);
    }

    const { data: completionData, error: completionError } = await (supabaseAdmin as any).rpc(
      "complete_daily_challenge",
      {
        p_challenge_id: ch.id,
        p_user_id: context.userId,
        p_answers: data.answers,
      },
    );
    if (completionError) throw completionError;
    const completion = Array.isArray(completionData) ? completionData[0] : completionData;
    if (!completion) throw new Error("Daily challenge submission failed");
    const correct = Number(completion.correct_count ?? 0);
    const total = Number(completion.total ?? questions.length);

    // The XP ledger is independently idempotent, so a retry can safely repair
    // an award if the original request ended after challenge completion.
    const { awardQuestionXp } = await import("@/lib/xp.server");
    const xp = await awardQuestionXp(supabaseAdmin, context.userId, correct, {
      type: "daily_challenge",
      id: ch.id,
    }).catch(() => null);
    // Wrong answers feed the spaced-repetition queue. This upsert is also safe
    // on replay and can repair a request interrupted after challenge completion.

    const wrong = questions.filter((q) => data.answers[q.id] !== q.correct);
    if (wrong.length) {
      const { upsertReviewItems } = await import("@/lib/review.server");
      await upsertReviewItems(supabaseAdmin, context.userId, wrong);
    }

    return {
      correct,
      total,
      already: !completion.submitted,
      xp_gained: xp?.gained ?? 0,
    };
  });
