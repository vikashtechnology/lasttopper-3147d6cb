import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * Local (device-side) notifications.
 * On a native Android/iOS build these fire even when the app is fully closed.
 * On the web we degrade gracefully to the browser Notification API (tab must be open).
 */

export const isNative = () => Capacitor.isNativePlatform();

const MOTIVATION_LINES = [
  "One quiz now beats one hour of scrolling. Let's go 🚀",
  "Toppers revise daily — 10 questions is all it takes today.",
  "Your rank is built in the boring hours. Practice now 📘",
  "Quick 5-question sprint? Your accuracy will thank you.",
  "Small streaks, big ranks. Keep the chain alive 🔥",
  "NCERT won't read itself — hit Revise for 5 minutes.",
  "Beat your last score. One battle, 60 seconds a question ⚔️",
  "Consistency > intensity. Solve a few and close the app.",
];

const STREAK_LINE = "Complete your streak! Solve today's questions before midnight 🔥";

/** ids are stable so re-scheduling replaces instead of duplicating */
const ID = {
  streak: 1001,
  motivation: (i: number) => 1100 + i,
  megaSaturday: 1201,
  megaSunday: 1202,
};

/** Times of day for motivational nudges (~every 2.5–3 hrs, daytime only). */
const MOTIVATION_TIMES = [
  { hour: 9, minute: 0 },
  { hour: 11, minute: 30 },
  { hour: 14, minute: 0 },
  { hour: 16, minute: 30 },
  { hour: 20, minute: 30 },
  { hour: 22, minute: 0 },
];

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (isNative()) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === "granted") return true;
      const req = await LocalNotifications.requestPermissions();
      return req.display === "granted";
    }
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Fire a notification immediately (community replies, battle events, etc). */
export async function notifyNow(title: string, body: string, extraId?: number) {
  try {
    if (isNative()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: extraId ?? Math.floor(Math.random() * 100000) + 5000,
            title,
            body,
            schedule: { at: new Date(Date.now() + 1000) },
            smallIcon: "ic_stat_icon_config_sample",
          },
        ],
      });
      return;
    }
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(title, { body, icon: "/app-icon-192.png" });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Schedules the repeating reminders on device:
 *  - 6:30 PM daily streak reminder
 *  - motivational nudges every ~2.5 hrs through the day
 *  - Sunday Mega Test reminders (day before and 30 minutes before the 10 AM start)
 */
export async function scheduleRecurringReminders() {
  if (!isNative()) return; // web can't schedule while closed
  const granted = await requestNotificationPermission();
  if (!granted) return;

  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }

    const notifications = [
      {
        id: ID.streak,
        title: "Keep your streak alive 🔥",
        body: STREAK_LINE,
        schedule: { on: { hour: 18, minute: 30 }, allowWhileIdle: true, repeats: true },
      },
      ...MOTIVATION_TIMES.map((t, i) => ({
        id: ID.motivation(i),
        title: "Last Topper",
        body: MOTIVATION_LINES[i % MOTIVATION_LINES.length],
        schedule: { on: { hour: t.hour, minute: t.minute }, allowWhileIdle: true, repeats: true },
      })),
      {
        // Saturday evening teaser
        id: ID.megaSaturday,
        title: "Sunday Mega Test tomorrow 🏆",
        body: "Entry opens tomorrow — 1st rank wins 100 TC + a free subscription. Get ready!",
        schedule: { on: { weekday: 7, hour: 20, minute: 0 }, allowWhileIdle: true, repeats: true },
      },
      {
        // 30 minutes before the Sunday 10 AM IST start
        id: ID.megaSunday,
        title: "Mega Test starts in 30 minutes ⚔️",
        body: "Join the Sunday Mega Test before it goes live at 10:00 AM.",
        schedule: { on: { weekday: 1, hour: 9, minute: 30 }, allowWhileIdle: true, repeats: true },
      },
    ];

    await LocalNotifications.schedule({ notifications });
  } catch {
    /* ignore */
  }
}

export { MOTIVATION_LINES };
