import { useEffect } from "react";

const SW_PATH = "/sw.js";

type AdTag = {
  key: string;
  src: string;
  zone: string;
  attrs?: Record<string, string>;
  appendTo?: "head" | "body";
};

const TAGS: AdTag[] = [
  {
    key: "monetag-tag-11392493",
    src: "https://5gvci.com/act/files/tag.min.js?z=11392493",
    zone: "11392493",
    attrs: { "data-cfasync": "false" },
    appendTo: "head",
  },
  {
    key: "monetag-tag-11392534",
    src: "https://nap5k.com/tag.min.js",
    zone: "11392534",
    appendTo: "body",
  },
  {
    key: "monetag-vignette-11392544",
    src: "https://n6wxm.com/vignette.min.js",
    zone: "11392544",
    appendTo: "body",
  },
];

/** Loads Monetag ad tags + registers their service worker. Use on Home & Community only. */
export function useMonetagAds() {
  useEffect(() => {
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
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(SW_PATH, { scope: "/" })
        .catch((e) => console.warn("Monetag SW failed", e));
    }
  }, []);
}
