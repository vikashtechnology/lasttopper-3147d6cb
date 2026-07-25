import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Latex } from "@/components/Latex";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { useHideAds } from "@/lib/useHideAds";
import { startQuickBattle, extendQuickBattle, submitBattle, getQuickLeaderboard } from "@/lib/battle.functions";
import { supabase } from "@/integrations/supabase/client";
import { Timer, Zap, Trophy, Loader2 } from "lucide-react";
import type { QuizQuestion } from "@/lib/learning.functions";

export const Route = createFileRoute("/_authenticated/battle/")({
  head: () => ({
    meta: [
      { title: "Quick Battle — Last Topper" },
      { name: "description", content: "10 questions. 30 seconds each. Top the live board." },
      { property: "og:title", content: "Quick Battle" },
      { property: "og:description", content: "10q · 30s each · live leaderboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuickBattle,
});

type Phase = "idle" | "countdown" | "playing" | "done";

function QuickBattle() {
  useAntiCheat(true);
  useHideAds();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const QUICK_TOTAL = 10;
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, "A" | "B" | "C" | "D">>({});
  const [tick, setTick] = useState(30);
  const startRef = useRef<number>(0);

  const leaderboard = useQuery({
    queryKey: ["quick-leaderboard"],
    queryFn: () => getQuickLeaderboard(),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("quick-battles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "battle_sessions" },
        () => qc.invalidateQueries({ queryKey: ["quick-leaderboard"] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);

  const start = useMutation({
    mutationFn: () => startQuickBattle(),
    onSuccess: (res) => {
      setQuestions(res.questions);
      setSessionId(res.id);
      setAnswers({}); setIdx(0);
      setPhase("countdown"); setCountdown(3);
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
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
      qc.invalidateQueries({ queryKey: ["quick-leaderboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  function advance(letter: "A" | "B" | "C" | "D" | null) {
    const q = questions[idx];
    if (!q) return;
    const next = { ...answers };
    if (letter) next[q.id] = letter;
    setAnswers(next);
    if (idx + 1 >= QUICK_TOTAL) submit.mutate(next);
    else setIdx((i) => i + 1);
  }

  // Progressive prefetch of the next 5 while player is answering the first 5
  const fetchingRef = useRef(false);
  useEffect(() => {
    if (phase !== "playing" || !sessionId) return;
    if (questions.length >= QUICK_TOTAL || fetchingRef.current) return;
    if (idx < questions.length - 2) return;
    fetchingRef.current = true;
    extendQuickBattle({ data: { id: sessionId } })
      .then((r) => { if (r.questions?.length) setQuestions(r.questions); })
      .catch((e: Error) => toast.error(e.message || "Failed to load more"))
      .finally(() => { fetchingRef.current = false; });
  }, [idx, questions.length, phase, sessionId]);

  const cur = questions[idx];
  const correctCount = useMemo(
    () => questions.reduce((n, q) => (answers[q.id] === q.correct ? n + 1 : n), 0),
    [answers, questions],
  );

  if (start.isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="battle-glass battle-slide-up p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
            <Zap className="h-8 w-8 animate-pulse" />
          </div>
          <div className="battle-title mt-4 text-2xl">Preparing arena…</div>
          <p className="mt-2 text-sm text-white/60">Loading 10 fresh NCERT questions</p>
        </div>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div className="space-y-6">
        <div className="battle-glass battle-slide-up p-6">
          <h1 className="battle-title text-2xl">Free Quick Quiz</h1>
          <p className="mt-2 text-sm text-white/70">10 questions · 30 seconds each · auto-advance</p>
          <button
            className="battle-btn mt-5 inline-flex items-center gap-2"
            onClick={() => start.mutate()}
          >
            <Zap className="h-4 w-4" />
            Enter Arena
          </button>
        </div>
        <div className="battle-glass p-5">
          <div className="mb-3 flex items-center gap-2 text-sm text-white/70">
            <Trophy className="h-4 w-4 text-yellow-300" /> Live Top 10 (last 24h)
          </div>
          <LeaderboardList items={leaderboard.data ?? []} />
        </div>
      </div>
    );
  }


  if (phase === "countdown") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="battle-title battle-pulse text-7xl font-black">
            {countdown > 0 ? countdown : "FIGHT!"}
          </div>
          <p className="mt-3 text-white/60">Get ready…</p>
        </div>
      </div>
    );
  }

  if (phase === "playing" && cur) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>Q {idx + 1} / {questions.length}</span>
          <span className="inline-flex items-center gap-1.5">
            <Timer className="h-4 w-4 text-cyan-300" />
            <span className={tick <= 5 ? "text-red-400" : "text-white"}>{tick}s</span>
          </span>
        </div>
        <div className="battle-glass battle-slide-up p-5">
          <div className="text-base leading-relaxed"><Latex>{cur.question}</Latex></div>
          <div className="mt-5 grid gap-2">
            {(["A", "B", "C", "D"] as const).map((l) => (
              <button
                key={l}
                onClick={() => advance(l)}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-cyan-400/60 hover:bg-cyan-400/5"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{l}</span>
                <span className="flex-1 text-sm"><Latex>{cur.options[l]}</Latex></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="battle-glass battle-slide-up p-6 text-center">
        <div className="battle-title text-3xl">Victory</div>
        <div className="mt-3 text-5xl font-black text-cyan-300">{correctCount * 10}</div>
        <div className="mt-1 text-sm text-white/70">{correctCount} / {questions.length} correct</div>
        <div className="mt-5 flex justify-center gap-2">
          <button className="battle-btn" onClick={() => start.mutate()}>Play again</button>
          <button
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80"
            onClick={() => navigate({ to: "/battle/leaderboard" })}
          >See board</button>
        </div>
      </div>
    </div>
  );
}

function LeaderboardList({
  items,
}: {
  items: Array<{
    rank: number;
    user: { full_name: string | null; email: string | null; avatar_url: string | null };
    score: number;
    correct_count: number;
    time_taken_seconds: number | null;
    is_me: boolean;
  }>;
}) {
  if (!items.length) return <p className="text-sm text-white/50">No plays yet — be first on the board.</p>;
  return (
    <ol className="space-y-1.5">
      {items.map((r) => (
        <li
          key={`${r.rank}-${r.user.email ?? r.user.full_name}`}
          className={`flex items-center gap-3 rounded-xl border p-2.5 ${
            r.is_me ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/5 bg-white/[0.02]"
          }`}
        >
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            r.rank === 1 ? "bg-yellow-400 text-black" : r.rank === 2 ? "bg-slate-300 text-black" : r.rank === 3 ? "bg-orange-400 text-black" : "bg-white/10 text-white"
          }`}>{r.rank}</span>
          <span className="flex-1 truncate text-sm">
            {r.user.full_name ?? r.user.email ?? "Player"}{r.is_me && <span className="ml-1 text-xs text-cyan-300">(you)</span>}
          </span>
          <span className="text-sm font-bold text-cyan-300">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}
