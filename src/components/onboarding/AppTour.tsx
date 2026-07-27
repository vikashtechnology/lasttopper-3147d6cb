import { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

const TOUR_KEY = "lt_home_tour_v1";

type TourStep = {
  target: string;
  title: string;
  body: string;
};

const STEPS: TourStep[] = [
  {
    target: "quota",
    title: "Your daily questions",
    body: "This tracks how many questions you've attempted today. Free plan gives you 20 per set — Pro removes the cap.",
  },
  {
    target: "streak",
    title: "Streak & XP",
    body: "Practice every day to grow your streak. Tap the flame anytime to see your best streak and last activity.",
  },
  {
    target: "practice",
    title: "Practice modes",
    body: "Daily challenge, review queue, past year papers, chapter learning, revision notes and your mistake bank all live here.",
  },
  {
    target: "notifications",
    title: "Stay in the loop",
    body: "Reminders for unfinished quests, community replies and Mega Test alerts show up here.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function readRect(target: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function AppTour({ enabled }: { enabled: boolean }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(TOUR_KEY)) return;
    const t = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(t);
  }, [enabled]);

  const step = STEPS[index];

  const sync = useCallback(() => {
    if (!step) return;
    setRect(readRect(step.target));
  }, [step]);

  useLayoutEffect(() => {
    if (!active || !step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(sync, 350);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [active, step, sync]);

  function close() {
    localStorage.setItem(TOUR_KEY, "1");
    setActive(false);
  }

  if (!active || !step || typeof document === "undefined") return null;

  const pad = 8;
  const box = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const cardTop = box
    ? box.top + box.height + 12 + 190 > window.innerHeight
      ? Math.max(12, box.top - 190)
      : box.top + box.height + 12
    : window.innerHeight / 2 - 90;
  const cardLeft = box
    ? Math.min(Math.max(12, box.left), Math.max(12, window.innerWidth - 340))
    : Math.max(12, window.innerWidth / 2 - 160);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tour"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100]"
      >
        <div className="absolute inset-0 bg-foreground/60 backdrop-blur-[1px]" onClick={close} />

        {box && (
          <motion.div
            layout
            className="pointer-events-none absolute rounded-2xl ring-4 ring-primary/70"
            style={{
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              boxShadow: "0 0 0 9999px hsl(var(--foreground) / 0.6)",
            }}
          />
        )}

        <motion.div
          layout
          className="absolute w-[320px] rounded-2xl border border-border bg-background p-4 shadow-2xl"
          style={{ top: cardTop, left: cardLeft }}
        >
          <div className="text-xs font-medium uppercase tracking-wide text-primary">
            Step {index + 1} of {STEPS.length}
          </div>
          <h3 className="mt-1 text-base font-semibold">{step.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={close}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Skip tour
            </button>
            <div className="flex gap-2">
              {index > 0 && (
                <Button size="sm" variant="outline" onClick={() => setIndex(index - 1)}>
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => (index < STEPS.length - 1 ? setIndex(index + 1) : close())}
              >
                {index < STEPS.length - 1 ? "Next" : "Got it"}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
