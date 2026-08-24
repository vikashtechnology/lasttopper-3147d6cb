// Guarded service-worker registration. It only runs in production and outside
// embedded previews. Add ?sw=off to unregister it while troubleshooting.
const SW_URL = "/pwa-sw.js";

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter(
        (registration) =>
          registration.active?.scriptURL.endsWith(SW_URL) ||
          registration.installing?.scriptURL.endsWith(SW_URL),
      )
      .map((registration) => registration.unregister()),
  );
}

export async function registerPWA() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const disabled =
    !import.meta.env.PROD || window.self !== window.top || url.searchParams.get("sw") === "off";

  if (disabled) {
    await unregisterMatching();
    return;
  }

  try {
    await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch (error) {
    console.warn("[pwa] Service-worker registration failed", error);
  }
}
