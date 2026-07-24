import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("users")
      .select(
        "id, email, full_name, avatar_url, country_code, phone, profession, onboarded, daily_question_limit, streak, total_accuracy",
      )
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

const phoneSchema = z.object({
  country_code: z.string().min(1).max(6),
  phone: z.string().min(4).max(20),
});

export const updatePhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => phoneSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("users")
      .update({ country_code: data.country_code, phone: data.phone })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

const professionSchema = z.object({ profession: z.enum(["pcm", "pcb"]) });

export const setProfession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => professionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("users")
      .update({ profession: data.profession })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("users")
      .update({ onboarded: true })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

// Update daily streak on app open. Increment when last_streak_date is yesterday;
// reset to 1 when gap > 1 day; no-op when already updated today.
export const pingActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: u } = await context.supabase
      .from("users")
      .select("streak, last_streak_date")
      .eq("id", context.userId)
      .maybeSingle();

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const last = u?.last_streak_date ? new Date(u.last_streak_date as string) : null;
    const streak = u?.streak ?? 0;

    let nextStreak = streak;
    if (!last) nextStreak = 1;
    else {
      const diffDays = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate())) / 86400000);
      if (diffDays === 0) return { streak };
      if (diffDays === 1) nextStreak = streak + 1;
      else nextStreak = 1;
    }

    await context.supabase
      .from("users")
      .update({ streak: nextStreak, last_streak_date: todayStr, last_active_date: todayStr })
      .eq("id", context.userId);
    return { streak: nextStreak };
  });
