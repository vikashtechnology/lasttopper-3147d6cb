import { useEffect } from "react";

const ZONE_ID = 11392378;
const SW_PATH = "/monetag-sw.js";
const TAG_SRC = `https://5gvci.com/act/files/tag.min.js?z=${ZONE_ID}`;

/** Loads the Monetag ad tag + registers their service worker. Home-only. */
export function useMonetagAds() {
  useEffect(() => {
    // Inject tag script once
    if (!document.querySelector(`script[data-monetag="1"]`)) {
      const s = document.createElement("script");
      s.src = TAG_SRC;
      s.async = true;
      s.dataset.monetag = "1";
      document.head.appendChild(s);
    }
    // Register Monetag SW at root scope
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(SW_PATH, { scope: "/" })
        .catch((e) => console.warn("Monetag SW failed", e));
    }
  }, []);
}
