/**
 * Single place that turns any thrown error into a short, generic user-facing
 * message. Technical details are never shown to users — they go to the console.
 */
const GENERIC = "Failed. Please try again.";

export function failMessage(err: unknown, fallback: string = GENERIC): string {
  if (err) console.error("[error]", err);
  return fallback;
}
