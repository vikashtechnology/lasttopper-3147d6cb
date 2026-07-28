import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChatText } from "@/lib/ai-router";

export type ProStudyPlan = {
  is_pro: boolean;
  plan: string | null;
  weak: { chapter: string; accuracy: number }[];
};

/**
 * Pro-only: an AI weekly study plan built from the user's weakest chapters.
 * Free users get `is_pro: false` and a locked card in the UI.
 */
export const getProStudyPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProStudyPlan> => {
    const { data: profile } = await context.supabase
      .from("users")
      .select("is_pro, profession")
      .eq("id", context.userId)
      .maybeSingle();

    if (!profile?.is_pro) return { is_pro: false, plan: null, weak: [] };

    const { getAnalyticsFor } = await import("@/lib/pro.server");
    const weak = await getAnalyticsFor(context.supabase, context.userId);
    if (weak.length === 0) {
      return {
        is_pro: true,
        weak,
        plan: "Attempt a few more quizzes and your personalised weekly plan will appear here.",
      };
    }

    const list = weak.map((w) => `${w.chapter} (${w.accuracy.toFixed(0)}%)`).join(", ");
    try {
      const plan = await aiChatText({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a strict NCERT-only study coach for Indian JEE/NEET aspirants. Reply with a compact 7-day plan: one line per day (Day 1 … Day 7) naming the chapter, what to revise, and how many practice questions. End with a single 'Focus tip' line. No preamble.",
          },
          {
            role: "user",
            content: `Stream: ${profile.profession ?? "pcm"}. Weakest chapters with accuracy: ${list}.`,
          },
        ],
      });
      return { is_pro: true, weak, plan: plan.trim() };
    } catch {
      return { is_pro: true, weak, plan: null };
    }
  });
