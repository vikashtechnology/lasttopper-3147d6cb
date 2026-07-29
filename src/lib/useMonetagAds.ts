import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/user.functions";

type AdTag = {
  key: string;
  src: string;
  zone: string;
  attrs?: Record<string, string>;
  appendTo?: "head" | "body";
};

/** Popup / vignette (interstitial) ads only — no push-notification ads. */
const TAGS: AdTag[] = [
  {
    key: "monetag-vignette-11392544",
    src: "https://n6wxm.com/vignette.min.js",
    zone: "11392544",
    appendTo: "body",
  },
];

/** Loads Monetag popup ad tags. Use on Home & Community only. Pro members are ad-free. */
export function useMonetagAds() {
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getMyProfile() });
  const isPro = !!(profile.data as { is_pro?: boolean } | undefined)?.is_pro;

  useEffect(() => {
    if (isPro) return;
    // Desktop only — no ads on phones or tablets.
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
    if (!isDesktop) return;
    for (const tag of TAGS) {
      if (document.querySelector(`script[data-monetag-key="${tag.key}"]`)) continue;
      const s = document.createElement("script");
      s.src = tag.src;
      s.async = true;
      s.dataset.monetagKey = tag.key;
      s.dataset.zone = tag.zone;
      if (tag.attrs) {
        for (const [k, v] of Object.entries(tag.attrs)) s.setAttribute(k, v);
      }
      (tag.appendTo === "body" ? document.body : document.head).appendChild(s);
    }

    // Clean up any previously registered Monetag push service worker.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          for (const r of regs) {
            const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? "";
            if (url.endsWith("/sw.js")) r.unregister();
          }
        })
        .catch(() => {});
    }
  }, [isPro]);
}
