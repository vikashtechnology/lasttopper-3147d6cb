/**
 * Google sign-in for the native Android/iOS shell.
 *
 * Google blocks OAuth inside embedded WebViews, so on native we open the
 * Lovable OAuth broker in the system browser (Chrome Custom Tab / SFSafari).
 * The broker redirects to https://<site>/auth/callback with the tokens, which
 * is an App Link / Universal Link, so Android/iOS hand it straight back to the
 * app. `__root.tsx` picks it up via `appUrlOpen`, closes the browser and sets
 * the Supabase session.
 */
export const NATIVE_CALLBACK_PATH = "/auth/callback";

/** Custom URL scheme registered by the native app (lasttopper://…). */
export const APP_SCHEME = "lasttopper";

/** Public URL marker that survives the OAuth broker's own state handling. */
export const NATIVE_CALLBACK_MARKER = "native_app";

/** Deep link that always re-opens the installed app with the OAuth tokens. */
export function appSchemeCallbackUrl(params: Record<string, string>) {
  return `${APP_SCHEME}://auth/callback?${new URLSearchParams(params).toString()}`;
}

export async function isNativeApp(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const STATE_KEY = "lt-oauth-state";

export function readStoredOAuthState(): string | null {
  try {
    return window.localStorage.getItem(STATE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredOAuthState() {
  try {
    window.localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

/** Opens the Google consent flow in the real external browser (Chrome/Safari). */
export async function startNativeGoogleSignIn(
  extraParams?: Record<string, string>,
) {
  const state = randomState();
  try {
    window.localStorage.setItem(STATE_KEY, state);
  } catch {
    /* ignore */
  }

  const params = new URLSearchParams({
    ...extraParams,
    provider: "google",
    redirect_uri: `${window.location.origin}${NATIVE_CALLBACK_PATH}?${NATIVE_CALLBACK_MARKER}=1`,
    // The "native-" prefix tells the callback page to hand control back to the
    // installed app (lasttopper:// deep link) if it opened in Chrome instead.
    state: `native-${state}`,
  });

  const url = `${window.location.origin}/~oauth/initiate?${params.toString()}`;

  // Preferred: hand the URL to the device's default browser app (Chrome /
  // Safari), so Google sees a real browser and the app is fully backgrounded.
  try {
    const { InAppBrowser } = await import("@capacitor/inappbrowser");
    await InAppBrowser.openInExternalBrowser({ url });
    return;
  } catch {
    /* plugin unavailable — fall back below */
  }

  // Fallback: Chrome Custom Tab / SFSafariViewController.
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
    return;
  } catch {
    /* fall through */
  }

  window.location.href = url;
}

/** Maps a native/custom/App Link URL to an in-app route. */
export function nativeRouteFromUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol === `${APP_SCHEME}:`) {
    // Handle lasttopper://app/* and lasttopper://auth/*
    if (url.hostname === "app" || url.host === "app") {
      const path = url.pathname === "/" ? "/home" : url.pathname;
      return `${path}${url.search}${url.hash}`;
    }
    if (url.hostname === "auth" || url.host === "auth") {
      return `${NATIVE_CALLBACK_PATH}${url.search}${url.hash}`;
    }
    const customPath = `/${url.hostname}${url.pathname}${url.search}${url.hash}`;
    return customPath.startsWith("//") ? customPath.slice(1) : customPath;
  }

  if (url.protocol === "https:") {
    // Check if it's one of our deep link domains
    const validDomains = ["lasttopper.lovable.app", "lasttopper.github.io"];
    if (validDomains.includes(url.hostname)) {
      const path = `${url.pathname}${url.search}${url.hash}`;
      return path === "/" ? "/home" : path;
    }
  }

  return null;
}

export async function closeNativeBrowser() {
  try {
    const { InAppBrowser } = await import("@capacitor/inappbrowser");
    await InAppBrowser.close();
  } catch {
    /* not open / not native */
  }
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    /* browser already closed or not native */
  }
}


export type OAuthCallbackTokens = {
  access_token: string;
  refresh_token: string;
  state: string | null;
  error: string | null;
};

/** Reads OAuth tokens from a callback URL (query string or hash). */
export function parseOAuthCallback(href: string): OAuthCallbackTokens | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const fromSearch = url.searchParams;
  const fromHash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const get = (k: string) => fromSearch.get(k) ?? fromHash.get(k);

  const error = get("error_description") ?? get("error");
  const access_token = get("access_token");
  const refresh_token = get("refresh_token");
  if (!access_token || !refresh_token) {
    return error ? { access_token: "", refresh_token: "", state: get("state"), error } : null;
  }
  return { access_token, refresh_token, state: get("state"), error: null };
}
