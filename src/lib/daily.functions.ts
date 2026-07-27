import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { QuizQuestion } from "@/lib/learning.functions";

export type DailyChallengeView = {
  id: string;
  date: string;
  questions: QuizQuestion[];
  attempted: boolean;
  correct_count: number;
  reward_tc: number;
};

export const getDailyChallenge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DailyChallengeView> => {
    const { ensureDailyChallenge, todayKey } = await import("@/lib/daily.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await context.supabase
      .from("users").select("profession").eq("id", context.userId).maybeSingle();
    const profession = profile?.profession as "pcm" | "pcb" | null;
    if (!profession) throw new Error("Complete onboarding first");

    const ch = await ensureDailyChallenge(context.supabase, supabaseAdmin, profession);
    const { data: attempt } = await context.supabase
      .from("daily_challenge_attempts")
      .select("correct_count, reward_tc, completed_at")
      .eq("challenge_id", ch.id).eq("user_id", context.userId).maybeSingle();

    return {
      id: ch.id,
      date: todayKey(),
      questions: ch.questions,
      attempted: !!attempt?.completed_at,
      correct_count: Number(attempt?.correct_count ?? 0),
      reward_tc: Number(attempt?.reward_tc ?? 0),
    };
  });

export const submitDailyChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      challenge_id: z.string().uuid(),
      answers: z.record(z.string(), z.enum(["A", "B", "C", "D"])),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rewardFor, creditCoins } = await import("@/lib/daily.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ch } = await context.supabase
      .from("daily_challenges").select("id, questions").eq("id", data.challenge_id).maybeSingle();
    if (!ch) throw new Error("Challenge not found");

    const { data: prior } = await context.supabase
      .from("daily_challenge_attempts")
      .select("correct_count, reward_tc, completed_at")
      .eq("challenge_id", ch.id).eq("user_id", context.userId).maybeSingle();
    if (prior?.completed_at) {
      return { correct: Number(prior.correct_count), total: (ch.questions as QuizQuestion[]).length, reward: Number(prior.reward_tc), already: true };
    }

    const questions = (ch.questions as QuizQuestion[]) ?? [];
    let correct = 0;
    for (const q of questions) if (data.answers[q.id] === q.correct) correct += 1;
    const reward = rewardFor(correct);

    await supabaseAdmin.from("daily_challenge_attempts").upsert(
      {
        challenge_id: ch.id,
        user_id: context.userId,
        correct_count: correct,
        total_count: questions.length,
        reward_tc: reward,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "challenge_id,user_id" },
    );
    await creditCoins(supabaseAdmin, context.userId, reward, "daily_challenge", `Daily Challenge reward (${correct}/${questions.length})`, ch.id);

    // Wrong answers feed the spaced-repetition queue.
    const wrong = questions.filter((q) => data.answers[q.id] !== q.correct);
    if (wrong.length) {
      const { upsertReviewItems } = await import("@/lib/review.server");
      await upsertReviewItems(supabaseAdmin, context.userId, wrong);
    }

    return { correct, total: questions.length, reward, already: false };
  });
