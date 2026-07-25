import { useEffect } from "react";

/**
 * Hides Monetag ad overlays/iframes on distraction-free routes
 * (learning, quiz, battle). Ads still load elsewhere (home, community).
 */
export function useHideAds() {
  useEffect(() => {
    const body = document.body;
    body.setAttribute("data-no-ads", "1");

    // Best-effort: also try to close any active vignette/interstitial iframes.
    const kill = () => {
      const selectors = [
        'iframe[src*="5gvci"]',
        'iframe[src*="nap5k"]',
        'iframe[src*="n6wxm"]',
        'iframe[src*="monetag"]',
        'div[id*="monetag"]',
      ];
      document.querySelectorAll(selectors.join(",")).forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });
    };
    kill();
    const obs = new MutationObserver(kill);
    obs.observe(document.body, { childList: true, subtree: true });

    return () => {
      body.removeAttribute("data-no-ads");
      obs.disconnect();
    };
  }, []);
}
