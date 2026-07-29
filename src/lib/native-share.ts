/**
 * Share helper that uses the native share sheet inside the Capacitor app
 * (Android / iOS), the Web Share API in mobile browsers, and falls back to
 * copying the link on desktop. Always safe to call from the browser.
 */
export async function shareOrCopy(opts: {
  title?: string;
  text: string;
  url?: string;
  files?: File[];
}): Promise<"shared" | "copied"> {
  const { title, text, url, files } = opts;

  // 1) Native app share sheet (works even where navigator.share is missing).
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url, dialogTitle: title });
      return "shared";
    }
  } catch {
    /* not native — continue */
  }

  // 2) Web Share API (with files when supported).
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (files?.length && nav.canShare?.({ files })) {
      await navigator.share({ title, text, files });
      return "shared";
    }
    if (typeof navigator.share === "function") {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return "shared";
  }

  // 3) Clipboard fallback.
  await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
  return "copied";
}
