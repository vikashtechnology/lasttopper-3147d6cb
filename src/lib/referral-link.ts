/**
 * Referral link capture.
 *
 * Invite links look like https://your-app.example/auth?ref=ABC12345.
 * On the web the code is in the URL; inside the Android/iOS app the same link
 * arrives through the deep-link listener. Either way we stash it so the
 * onboarding screen can prefill it after Google sign-in.
 */
const KEY = "lt-pending-ref";

export function storeReferralFromUrl(href?: string) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(href ?? window.location.href);
    const code = url.searchParams.get("ref") ?? url.searchParams.get("referral");
    if (code && /^[A-Za-z0-9]{4,16}$/.test(code)) {
      window.localStorage.setItem(KEY, code.toUpperCase());
    }
  } catch {
    /* ignore malformed urls */
  }
}

export function getPendingReferral(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearPendingReferral() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
