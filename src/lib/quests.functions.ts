import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Quest = { kind: string; title: string; body: string; link: string };

/**
 * Checks the user's pending daily quests (daily challenge, review queue,
 * practice, revise) and pushes an in-app notification for each incomplete one.
 * Deduped: at most one notification per quest per day.
 */
export const pushPendingQuestReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const since = startOfDay.toISOString();
    const dayKey = startOfDay.toISOString().slice(0, 10);

    const pending: Quest[] = [];

    // 1) Daily challenge
    const { data: todaysChallenge } = await context.supabase
      .from("daily_challenges")
      .select("id")
      .eq("challenge_date", dayKey)
      .maybeSingle();
    let challengeDone = false;
    if (todaysChallenge?.id) {
      const { data: attempt } = await context.supabase
        .from("daily_challenge_attempts")
        .select("completed_at")
        .eq("challenge_id", todaysChallenge.id)
        .eq("user_id", userId)
        .maybeSingle();
      challengeDone = !!attempt?.completed_at;
    }
    if (!challengeDone) {
      pending.push({
        kind: "quest_daily",
        title: "Daily Challenge pending 🎯",
        body: "10 quick NCERT questions are waiting — finish them and earn Topper Coins 🪙",
        link: "/daily",
      });
    }

    // 2) Spaced repetition queue
    const { count: dueCount } = await context.supabase
      .from("review_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due_at", now.toISOString());
    if ((dueCount ?? 0) > 0) {
      pending.push({
        kind: "quest_review",
        title: `${dueCount} cards due for review 🔁`,
        body: "Your mistakes are due today — clear the review queue and lock them in 🧠",
        link: "/review",
      });
    }

    // 3) Practice (learning)
    const { count: quizToday } = await context.supabase
      .from("quiz_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((quizToday ?? 0) === 0) {
      pending.push({
        kind: "quest_learning",
        title: "No practice yet today 📘",
        body: "Pick a chapter and solve a set — keep your streak alive 🔥",
        link: "/learning",
      });
    }

    // 4) Revise
    const { count: reviseToday } = await context.supabase
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "revise_view")
      .gte("created_at", since);
    if ((reviseToday ?? 0) === 0) {
      pending.push({
        kind: "quest_revise",
        title: "Revise something today 📖",
        body: "5 minutes of NCERT notes beats an hour of scrolling ✨",
        link: "/revise",
      });
    }

    if (!pending.length) return { sent: 0 };

    // Dedupe: skip quests already notified today
    const { data: already } = await supabaseAdmin
      .from("notifications")
      .select("kind")
      .eq("user_id", userId)
      .gte("created_at", since)
      .in("kind", pending.map((q) => q.kind));
    const seen = new Set((already ?? []).map((r) => r.kind as string));

    const rows = pending
      .filter((q) => !seen.has(q.kind))
      .map((q) => ({ user_id: userId, kind: q.kind, title: q.title, body: q.body, link: q.link }));
    if (!rows.length) return { sent: 0 };

    await supabaseAdmin.from("notifications").insert(rows);
    return { sent: rows.length };
  });
