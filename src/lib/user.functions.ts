import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeFileName, sendTelegramDocument, buildReport, fmtIST, fmtDate } from "@/lib/telegram-alert";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("users")
      .select(
        "id, email, full_name, avatar_url, country_code, phone, profession, onboarded, daily_question_limit, streak, total_accuracy, is_pro, pro_since, date_of_birth, terms_accepted_at",
      )
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

const signupSchema = z.object({
  full_name: z.string().trim().min(2).max(80),
  country_code: z.string().min(1).max(6),
  phone: z.string().trim().min(4).max(20),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accept_terms: z.literal(true),
});


export const saveSignupDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => signupSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Validate DOB (>= 8 years old, <= 100)
    const dob = new Date(data.date_of_birth + "T00:00:00Z");
    const now = new Date();
    const ageMs = now.getTime() - dob.getTime();
    const years = ageMs / (365.25 * 24 * 3600 * 1000);
    if (Number.isNaN(years) || years < 8 || years > 100) {
      throw new Error("Please enter a valid date of birth.");
    }

    // Enforce uniqueness of phone across accounts
    const { data: existing, error: qErr } = await context.supabase
      .from("users")
      .select("id")
      .eq("phone", data.phone)
      .neq("id", context.userId)
      .maybeSingle();
    if (qErr) throw qErr;
    if (existing) {
      throw new Error("This phone number is already linked to another account.");
    }

    const { error } = await context.supabase
      .from("users")
      .update({
        full_name: data.full_name,
        country_code: data.country_code,
        phone: data.phone,
        date_of_birth: data.date_of_birth,
        terms_accepted_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) {
      const msg = String((error as { message?: string }).message ?? "");
      if (msg.includes("duplicate key")) {
        throw new Error("This phone number is already linked to another account.");
      }
      throw error;
    }

    return { ok: true };
  });

const phoneSchema = z.object({
  country_code: z.string().min(1).max(6),
  phone: z.string().min(4).max(20),
});

export const updatePhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => phoneSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: existing, error: qErr } = await context.supabase
      .from("users")
      .select("id")
      .eq("phone", data.phone)
      .neq("id", context.userId)
      .maybeSingle();
    if (qErr) throw qErr;
    if (existing) throw new Error("This phone number is already linked to another account.");

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
    const { data: u } = await context.supabase
      .from("users")
      .select(
        "email, full_name, country_code, phone, profession, date_of_birth, terms_accepted_at, signup_alert_sent_at, created_at",
      )
      .eq("id", context.userId)
      .maybeSingle();

    if (!u?.phone || !u?.date_of_birth || !u?.full_name || !u?.email) {
      throw new Error("Please complete your profile (name, DOB, email) before continuing.");
    }

    const { error } = await context.supabase
      .from("users")
      .update({ onboarded: true })
      .eq("id", context.userId);
    if (error) throw error;

    // One-time signup verification alert to the dedicated bot
    if (!u.signup_alert_sent_at) {
      const lines = buildReport("New signup verified", [
        ["Name", u.full_name],
        ["Email", u.email],
        ["Phone", `${u.country_code ?? "+91"} ${u.phone}`],
        ["Date of birth", fmtDate(u.date_of_birth)],
        ["Track", (u.profession ?? "").toString().toUpperCase()],
        ["Terms accepted", fmtIST(u.terms_accepted_at)],
        ["Signed up at", fmtIST(u.created_at)],
        ["User ID", context.userId],
      ]);
      const fileName = safeFileName([String(u.full_name ?? "user"), "new_user"], "txt");
      await sendTelegramDocument(
        fileName,
        lines,
        [
          "🆕 <b>New signup verified</b>",
          `👤 ${u.full_name ?? "—"}`,
          `📱 ${u.country_code ?? "+91"} ${u.phone}`,
          `🎓 ${(u.profession ?? "—").toString().toUpperCase()}`,
        ].join("\n"),
      );

      await context.supabase
        .from("users")
        .update({ signup_alert_sent_at: new Date().toISOString() })
        .eq("id", context.userId);
    }

    return { ok: true };
  });

// Update daily streak on app open. Increment when last_streak_date is yesterday;
// reset to 1 when gap > 1 day; no-op when already updated today.
export const pingActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: u } = await context.supabase
      .from("users")
      .select("streak, best_streak, last_streak_date")
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
      .update({
        streak: nextStreak,
        best_streak: Math.max(Number(u?.best_streak ?? 0), nextStreak),
        last_streak_date: todayStr,
        last_active_date: todayStr,
      })
      .eq("id", context.userId);
    return { streak: nextStreak };
  });

// Streak details for the home header chip modal.
export const getStreakDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("users")
      .select("streak, best_streak, last_streak_date, last_active_date")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return {
      streak: Number(data?.streak ?? 0),
      best_streak: Math.max(Number(data?.best_streak ?? 0), Number(data?.streak ?? 0)),
      last_streak_date: (data?.last_streak_date as string | null) ?? null,
      last_active_date: (data?.last_active_date as string | null) ?? null,
    };
  });

