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
