import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Latex } from "@/components/Latex";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { useHideAds } from "@/lib/useHideAds";
import { start1v1Battle, extendQuickBattle, submitBattle } from "@/lib/battle.functions";
import { Timer, Users, Loader2, Swords } from "lucide-react";
import type { QuizQuestion } from "@/lib/learning.functions";
import { useUserStore } from "@/store/user";

export const Route = createFileRoute("/_authenticated/battle/1v1")({
  head: () => ({
    meta: [
      { title: "1v1 Battle — Last Topper" },
      { name: "description", content: "Head-to-head 10-question duel. Beat your rival to the top." },
      { property: "og:title", content: "1v1 Battle" },
      { property: "og:description", content: "10q · 30s each · beat your rival." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OneVOne,
});

const BOT_NAMES = [
  "Aarav Sharma", "Vivaan Mehta", "Aditya Verma", "Ishaan Rao", "Rohan Iyer",
  "Kabir Nair", "Arjun Patel", "Rehan Khan", "Dhruv Kapoor", "Aryan Joshi",
  "Ananya Reddy", "Diya Kulkarni", "Saanvi Menon", "Meera Bansal", "Riya Chauhan",
  "Kavya Pillai", "Ishita Ghosh", "Neha Dubey", "Pooja Yadav", "Sneha Malhotra",
  "Karan Trivedi", "Yash Agarwal", "Nikhil Bhat", "Siddharth Mishra", "Manav Saxena",
];

type Phase = "idle" | "matching" | "countdown" | "playing" | "done";
const TOTAL = 10;

function OneVOne() {
  useAntiCheat(true);
  useHideAds();
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);

  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [matchDots, setMatchDots] = useState(0);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, "A" | "B" | "C" | "D">>({});
  const [tick, setTick] = useState(30);
  const startRef = useRef<number>(0);

  // Bot state
  const [bot, setBot] = useState<{
    name: string;
    // per-question: will_be_correct, respond_after_seconds
    plan: Array<{ correct: boolean; delay: number }>;
  } | null>(null);
  const [botIdx, setBotIdx] = useState(0);
  const [botCorrect, setBotCorrect] = useState(0);

  const start = useMutation({
    mutationFn: () => start1v1Battle(),
    onSuccess: (res) => {
      setQuestions(res.questions);
      setSessionId(res.id);
      setAnswers({}); setIdx(0);
      // Build bot plan
      const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      const correctCount = 5 + Math.floor(Math.random() * 4); // 5..8
      const correctFlags = Array.from({ length: TOTAL }, (_, i) => i < correctCount);
      // shuffle
      for (let i = correctFlags.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [correctFlags[i], correctFlags[j]] = [correctFlags[j], correctFlags[i]];
      }
      const plan = correctFlags.map((c) => ({
        correct: c,
        delay: 6 + Math.floor(Math.random() * 20), // 6..25s per q
      }));
      setBot({ name, plan });
      setBotIdx(0); setBotCorrect(0);
      setPhase("matching");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to start"),
  });

  const submit = useMutation({
    mutationFn: (finalAnswers: Record<string, "A" | "B" | "C" | "D">) => {
      const elapsed = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000));
      return submitBattle({ data: { id: sessionId!, answers: finalAnswers, time_taken_seconds: elapsed } });
    },
    onSuccess: () => {
      setPhase("done");
      const myCorrect = questions.reduce((n, q) => (answers[q.id] === q.correct ? n + 1 : n), 0);
      if (myCorrect > botCorrect) {
        confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // "Matching" spinner then countdown
  useEffect(() => {
    if (phase !== "matching") return;
    const d = setInterval(() => setMatchDots((n) => (n + 1) % 4), 400);
    const t = setTimeout(() => { setPhase("countdown"); setCountdown(3); }, 3200);
    return () => { clearInterval(d); clearTimeout(t); };
  }, [phase]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      startRef.current = Date.now();
      setPhase("playing"); setTick(30);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Per-question player timer
  useEffect(() => {
    if (phase !== "playing") return;
    setTick(30);
    const t = setInterval(() => {
      setTick((v) => {
        if (v <= 1) { clearInterval(t); advance(null); return 0; }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase]);

  // Bot's independent per-question timer
  useEffect(() => {
    if (phase !== "playing" || !bot) return;
    if (botIdx >= TOTAL) return;
    const step = bot.plan[botIdx];
    const t = setTimeout(() => {
      if (step.correct) setBotCorrect((n) => n + 1);
      setBotIdx((n) => n + 1);
    }, Math.min(step.delay, 30) * 1000);
    return () => clearTimeout(t);
  }, [phase, bot, botIdx]);

  function advance(letter: "A" | "B" | "C" | "D" | null) {
    const q = questions[idx];
    if (!q) return;
    const next = { ...answers };
    if (letter) next[q.id] = letter;
    setAnswers(next);
    if (idx + 1 >= TOTAL) submit.mutate(next);
    else setIdx((i) => i + 1);
  }

  // Progressive prefetch
  const fetchingRef = useRef(false);
  useEffect(() => {
    if (phase !== "playing" || !sessionId) return;
    if (questions.length >= TOTAL || fetchingRef.current) return;
    if (idx < questions.length - 2) return;
    fetchingRef.current = true;
    extendQuickBattle({ data: { id: sessionId } })
      .then((r) => { if (r.questions?.length) setQuestions(r.questions); })
      .catch((e: Error) => toast.error(e.message || "Failed to load more"))
      .finally(() => { fetchingRef.current = false; });
  }, [idx, questions.length, phase, sessionId]);

  const cur = questions[idx];
  const myCorrect = useMemo(
    () => questions.reduce((n, q) => (answers[q.id] === q.correct ? n + 1 : n), 0),
    [answers, questions],
  );
  const myName = profile?.full_name?.split(" ")[0] ?? "You";

  if (start.isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="battle-glass battle-slide-up p-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: "var(--neon-cyan)" }} />
          <div className="battle-title mt-4 text-2xl">Preparing arena…</div>
        </div>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div className="space-y-6">
        <div className="battle-glass battle-slide-up p-6">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5" style={{ color: "var(--neon-cyan)" }} />
            <h1 className="battle-title text-2xl">1v1 Duel</h1>
          </div>
          <p className="mt-2 text-sm opacity-70">
            10 NCERT questions · 30 seconds each · beat your rival live.
          </p>
          <ul className="mt-3 space-y-1 text-sm opacity-80">
            <li>• Matched against another aspirant instantly.</li>
            <li>• Race side-by-side — most correct wins.</li>
            <li>• If no human is around, a rival bot steps in.</li>
          </ul>
          <button
            className="battle-btn mt-5 inline-flex items-center gap-2"
            onClick={() => start.mutate()}
          >
            <Users className="h-4 w-4" />
            Find Rival
          </button>
        </div>
      </div>
    );
  }

  if (phase === "matching") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="battle-glass battle-slide-up p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "rgba(34,211,238,0.1)" }}>
            <Users className="h-8 w-8 animate-pulse" style={{ color: "var(--neon-cyan)" }} />
          </div>
          <div className="battle-title mt-4 text-2xl">
            Finding rival{".".repeat(matchDots)}
          </div>
          <p className="mt-2 text-sm opacity-60">Scanning live players across India</p>
        </div>
      </div>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          {bot && (
            <div className="mb-6 flex items-center justify-center gap-4 text-sm">
              <span className="font-semibold">{myName}</span>
              <span className="battle-title text-lg opacity-60">VS</span>
              <span className="font-semibold">{bot.name}</span>
            </div>
          )}
          <div className="battle-title battle-pulse text-7xl font-black">
            {countdown > 0 ? countdown : "FIGHT!"}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "playing" && !cur) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="battle-glass p-6 text-center text-sm opacity-70">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" style={{ color: "var(--neon-cyan)" }} />
          <div className="mt-3">Loading next questions…</div>
        </div>
      </div>
    );
  }

  if (phase === "playing" && cur) {
    return (
      <div className="space-y-4">
        {/* Rival HUD */}
        <div className="battle-glass p-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <PlayerBar name={myName} progress={idx} total={TOTAL} highlight />
            <PlayerBar name={bot?.name ?? "Rival"} progress={botIdx} total={TOTAL} />
          </div>
        </div>

        <div className="flex items-center justify-between text-sm opacity-80">
          <span>Q {idx + 1} / {TOTAL}</span>
          <span className="inline-flex items-center gap-1.5">
            <Timer className="h-4 w-4" style={{ color: "var(--neon-cyan)" }} />
            <span className={tick <= 5 ? "text-red-500 font-bold" : ""}>{tick}s</span>
          </span>
        </div>

        <div className="battle-glass battle-slide-up p-5">
          <div className="text-base leading-relaxed"><Latex>{cur.question}</Latex></div>
          <div className="mt-5 grid gap-2">
            {(["A", "B", "C", "D"] as const).map((l) => (
              <button
                key={l}
                onClick={() => advance(l)}
                className="flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:border-cyan-400/60"
                style={{ borderColor: "var(--battle-header-border)" }}
              >
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold" style={{ background: "rgba(255,255,255,0.08)" }}>{l}</span>
                <span className="flex-1 text-sm"><Latex>{cur.options[l]}</Latex></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const won = myCorrect > botCorrect;
  const tie = myCorrect === botCorrect;
  return (
    <div className="space-y-6">
      <div className="battle-glass battle-slide-up p-6 text-center">
        <div className="battle-title text-3xl">
          {won ? "Victory 🏆" : tie ? "Draw 🤝" : "Defeat 💥"}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <ResultCard name={myName} correct={myCorrect} total={TOTAL} winner={won} />
          <ResultCard name={bot?.name ?? "Rival"} correct={botCorrect} total={TOTAL} winner={!won && !tie} />
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <button className="battle-btn" onClick={() => start.mutate()}>Rematch</button>
          <button
            className="rounded-xl border px-4 py-2 text-sm"
            style={{ borderColor: "var(--battle-header-border)" }}
            onClick={() => navigate({ to: "/battle" })}
          >Back to Arena</button>
        </div>
      </div>
    </div>
  );
}

function PlayerBar({ name, progress, total, highlight }: { name: string; progress: number; total: number; highlight?: boolean }) {
  const pct = Math.min(100, (progress / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={`truncate font-semibold ${highlight ? "" : "opacity-80"}`}>{name}</span>
        <span className="opacity-70">{progress}/{total}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: highlight ? "var(--neon-cyan)" : "var(--neon-magenta, #ec4899)" }}
        />
      </div>
    </div>
  );
}

function ResultCard({ name, correct, total, winner }: { name: string; correct: number; total: number; winner: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${winner ? "border-cyan-400/60" : ""}`}
      style={{
        borderColor: winner ? undefined : "var(--battle-header-border)",
        background: winner ? "rgba(34,211,238,0.08)" : "rgba(255,255,255,0.03)",
      }}
    >
      <div className="truncate text-sm font-semibold">{name}</div>
      <div className="mt-1 text-3xl font-black" style={{ color: winner ? "var(--neon-cyan)" : undefined }}>
        {correct * 10}
      </div>
      <div className="text-xs opacity-70">{correct}/{total} correct</div>
    </div>
  );
}
