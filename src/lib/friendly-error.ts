/**
 * Single place that turns any thrown error into a short, generic user-facing
 * message. Technical details are never shown to users — they go to the console.
 */
const GENERIC = "Failed. Please try again.";

/** Raw error text, used only to detect known control tokens (PRO_REQUIRED, DAILY_LIMIT). */
export function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message ?? "";
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err ?? "");
  } catch {
    return "";
  }
}

export function isDailyLimit(err: unknown): boolean {
  return rawMessage(err).includes("DAILY_LIMIT");
}

export function isProRequired(err: unknown): boolean {
  return rawMessage(err).includes("PRO_REQUIRED");
}

export function failMessage(err: unknown, fallback: string = GENERIC): string {
  if (err) console.error("[error]", err);
  if (isDailyLimit(err)) return "Daily free question limit reached. Upgrade to Pro for unlimited practice.";
  return fallback;
}
