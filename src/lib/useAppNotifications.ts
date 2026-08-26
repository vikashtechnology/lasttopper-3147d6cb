import { useEffect, useRef } from "react";
import { listNotifications } from "@/lib/community.functions";
import { isNative, notifyNow, scheduleRecurringReminders } from "@/lib/local-notifications";

/**
 * Schedules native reminders and polls server-owned Firestore notifications.
 * Client Firestore access stays disabled; Firebase Admin serves the data.
 */
export function useAppNotifications() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (isNative()) void scheduleRecurringReminders();

    let disposed = false;
    let initialized = false;
    let known = new Set<string>();

    const refresh = async () => {
      try {
        const rows = await listNotifications();
        if (disposed) return;
        if (initialized) {
          for (const row of rows) {
            if (!known.has(row.id)) void notifyNow(row.title ?? "Last Topper", row.body ?? "");
          }
        }
        known = new Set(rows.map((row) => row.id));
        initialized = true;
      } catch {
        // Authentication may still be settling; the next poll retries.
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);
}
