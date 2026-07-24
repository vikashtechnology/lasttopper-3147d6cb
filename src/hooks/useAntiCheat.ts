import { useEffect } from "react";

// Basic web hardening for battle screens. Trivially bypassable in a browser
// but deters casual screenshotting/copying. Real Android FLAG_SECURE needs
// Capacitor. Cleans up on unmount so it doesn't leak into other routes.
export function useAntiCheat(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "printscreen") { e.preventDefault(); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && ["p", "s", "c", "x", "u"].includes(k)) { e.preventDefault(); return; }
      if (mod && e.shiftKey && ["i", "j", "c"].includes(k)) { e.preventDefault(); return; }
      if (k === "f12") e.preventDefault();
    };

    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    window.addEventListener("contextmenu", stop);
    window.addEventListener("copy", stop);
    window.addEventListener("cut", stop);
    window.addEventListener("paste", stop);
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("contextmenu", stop);
      window.removeEventListener("copy", stop);
      window.removeEventListener("cut", stop);
      window.removeEventListener("paste", stop);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled]);
}
