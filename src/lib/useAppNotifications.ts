import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  notifyNow,
  scheduleRecurringReminders,
  requestNotificationPermission,
} from "@/lib/local-notifications";

/**
 * Mounts device notifications:
 *  - schedules the recurring streak / motivation / mega-test reminders (native only)
 *  - live-pushes community activity and personal alerts while the app is running
 */
export function useAppNotifications() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      await requestNotificationPermission();
      await scheduleRecurringReminders();
    })();

    let userId: string | null = null;

    const channel = supabase
      .channel("app-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "forum_posts" },
        (payload) => {
          const row = payload.new as { title?: string; user_id?: string };
          if (row.user_id && row.user_id === userId) return;
          void notifyNow(
            "New discussion in Community 💬",
            row.title ?? "Someone started a new thread.",
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "study_group_messages" },
        (payload) => {
          const row = payload.new as { body?: string; user_id?: string };
          if (row.user_id && row.user_id === userId) return;
          void notifyNow(
            "New message in your study group 👥",
            row.body?.slice(0, 120) ?? "Tap to read.",
          );
        },
      )
      .subscribe();

    void supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
      if (!userId) return;
      supabase
        .channel(`personal-notifications-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as { title?: string; body?: string };
            void notifyNow(row.title ?? "Last Topper", row.body ?? "");
          },
        )
        .subscribe();
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
