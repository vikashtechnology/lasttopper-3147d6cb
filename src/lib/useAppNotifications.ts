import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isNative, notifyNow, scheduleRecurringReminders } from "@/lib/local-notifications";

/**
 * Mounts device notifications:
 *  - schedules recurring reminders in an installed native app
 *  - shows live community/personal alerts while the application is running
 *
 * Web notification permission is requested only from the explicit test/enable
 * button on the Notifications page because browsers require a user gesture.
 */
export function useAppNotifications() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (isNative()) {
      void scheduleRecurringReminders();
    }

    let userId: string | null = null;
    let personalChannel: RealtimeChannel | null = null;
    let disposed = false;

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
      if (disposed) return;
      userId = data.user?.id ?? null;
      if (!userId) return;
      personalChannel = supabase
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
      disposed = true;
      void supabase.removeChannel(channel);
      if (personalChannel) void supabase.removeChannel(personalChannel);
    };
  }, []);
}
