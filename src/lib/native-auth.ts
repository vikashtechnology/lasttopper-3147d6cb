/** Google sign-in and deep-link helpers for the native Android/iOS shell. */
export const NATIVE_CALLBACK_PATH = "/auth/callback";

/** Custom URL scheme registered by the native app (lasttopper://…). */
export const APP_SCHEME = "lasttopper";

/** Marks an OAuth callback that should return control to the installed app. */
export const NATIVE_CALLBACK_MARKER = "native_app";

const configuredPublicUrl = String(import.meta.env.VITE_PUBLIC_APP_URL ?? "").trim();
export const PUBLIC_APP_URL = (
  configuredPublicUrl || "https://last-topper-web-test.vercel.app"
).replace(/\/+$/, "");

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/** HTTPS hosts permitted to open routes in the native app. */
export const APP_DOMAINS = Array.from(
  new Set(
    [hostnameOf(PUBLIC_APP_URL), "last-topper-web-test.vercel.app"].filter(
      (host): host is string => !!host,
    ),
  ),
);

/** Deep link that re-opens the installed app with OAuth callback parameters. */
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

/** Opens a provider authorization URL in the device's real browser. */
export async function openNativeAuthUrl(url: string): Promise<void> {
  try {
    const { InAppBrowser } = await import("@capacitor/inappbrowser");
    await InAppBrowser.openInExternalBrowser({ url });
    return;
  } catch {
    /* plugin unavailable — fall back below */
  }

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

  if (url.protocol === "https:" && APP_DOMAINS.includes(url.hostname)) {
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path === "/" ? "/home" : path;
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
  const get = (key: string) => fromSearch.get(key) ?? fromHash.get(key);

  const error = get("error_description") ?? get("error");
  const access_token = get("access_token");
  const refresh_token = get("refresh_token");
  if (!access_token || !refresh_token) {
    return error ? { access_token: "", refresh_token: "", state: get("state"), error } : null;
  }
  return { access_token, refresh_token, state: get("state"), error: null };
}
