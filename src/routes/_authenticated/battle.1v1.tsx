import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Latex } from "@/components/Latex";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { useHideAds } from "@/lib/useHideAds";
import { start1v1Battle, extendQuickBattle, submitBattle } from "@/lib/battle.functions";
import { Timer, Users, Loader2, Swords, Flame } from "lucide-react";
import type { QuizQuestion } from "@/lib/learning.functions";
import { useUserStore } from "@/store/user";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/battle/1v1")({
  head: () => ({
    meta: [
      { title: "1v1 Battle — Last Topper" },
      { name: "description", content: "Head-to-head 10-question live duel. 1 minute per question." },
      { property: "og:title", content: "1v1 Live Battle" },
      { property: "og:description", content: "10q · 60s each · beat your rival." },
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

type Phase = "idle" | "matching" | "notfound" | "countdown" | "playing" | "done";
const TOTAL = 10;
const PER_Q_SECONDS = 60;

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "P";
}

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
  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [tick, setTick] = useState(PER_Q_SECONDS);
  const startRef = useRef<number>(0);

  const [bot, setBot] = useState<{
    name: string;
    rank: number;
    plan: Array<{ correct: boolean; delay: number }>;
  } | null>(null);
  const [botIdx, setBotIdx] = useState(0);
  const [botCorrect, setBotCorrect] = useState(0);

  const myRank = useMemo(() => 100 + Math.floor(Math.random() * 400), []);

  const [joinCode, setJoinCode] = useState("");
  const joinRef = useRef(false);

  const start = useMutation({
    mutationFn: () => start1v1Battle(),
    onSuccess: (res) => {
      setQuestions(res.questions);
      setSessionId(res.id);
      setAnswers({}); setIdx(0); setSelected(null);
      const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      const correctCount = 5 + Math.floor(Math.random() * 4);
      const correctFlags = Array.from({ length: TOTAL }, (_, i) => i < correctCount);
      for (let i = correctFlags.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [correctFlags[i], correctFlags[j]] = [correctFlags[j], correctFlags[i]];
      }
      const plan = correctFlags.map((c) => ({
        correct: c,
        delay: 15 + Math.floor(Math.random() * 40), // 15..55s
      }));
      setBot({ name, rank: 80 + Math.floor(Math.random() * 400), plan });
      setBotIdx(0); setBotCorrect(0);
      if (joinRef.current) { joinRef.current = false; setCountdown(3); setPhase("countdown"); }
      else setPhase("matching");
    },

    onError: (e: Error) => toast.error(failMessage(e, "Failed to start")),
  });

  const submit = useMutation({
    mutationFn: (finalAnswers: Record<string, "A" | "B" | "C" | "D">) => {
      const elapsed = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000));
      return submitBattle({ data: { id: sessionId!, answers: finalAnswers, time_taken_seconds: elapsed } });
    },
    onSuccess: () => {
      setPhase("done");
      const myCorrect = questions.reduce((n, q) => (answers[q.id] === q.correct ? n + 1 : n), 0);
      if (myCorrect > botCorrect) confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 } });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  useEffect(() => {
    if (phase !== "matching") return;
    const d = setInterval(() => setMatchDots((n) => (n + 1) % 4), 400);
    const t = setTimeout(() => setPhase("notfound"), 4200);
    return () => { clearInterval(d); clearTimeout(t); };
  }, [phase]);

  const roomCode = useMemo(
    () => Math.random().toString(36).slice(2, 8).toUpperCase(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase === "notfound"],
  );

  async function invite() {
    const url = `${window.location.origin}/battle/1v1?room=${roomCode}`;
    const text = `Join my 1v1 Last Topper battle! Room code: ${roomCode}\n${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "1v1 Battle", text, url });
      else { await navigator.clipboard.writeText(text); toast.success("Invite link copied"); }
    } catch { /* dismissed */ }
  }

  function joinRoom(code?: string) {
    const c = (code ?? joinCode).trim().toUpperCase();
    if (c.length < 4) { toast.error("Enter a valid room code"); return; }
    joinRef.current = true;
    toast.success(`Joining room ${c}…`);
    start.mutate();
  }

  // Prefill / auto-join from an invite link (?room=CODE)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = new URLSearchParams(window.location.search).get("room");
    if (c) setJoinCode(c.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      startRef.current = Date.now();
      setPhase("playing"); setTick(PER_Q_SECONDS);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== "playing") return;
    setTick(PER_Q_SECONDS);
    setSelected(null);
    const t = setInterval(() => {
      setTick((v) => {
        if (v <= 1) { clearInterval(t); advance(null); return 0; }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase]);

  useEffect(() => {
    if (phase !== "playing" || !bot) return;
    if (botIdx >= TOTAL) return;
    const step = bot.plan[botIdx];
    const t = setTimeout(() => {
      if (step.correct) setBotCorrect((n) => n + 1);
      setBotIdx((n) => n + 1);
    }, Math.min(step.delay, PER_Q_SECONDS) * 1000);
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

  function pick(letter: "A" | "B" | "C" | "D") {
    if (selected) return;
    setSelected(letter);
    setTimeout(() => advance(letter), 350);
  }

  const fetchingRef = useRef(false);
  useEffect(() => {
    if (phase !== "playing" || !sessionId) return;
    if (questions.length >= TOTAL || fetchingRef.current) return;
    if (idx < questions.length - 2) return;
    fetchingRef.current = true;
    extendQuickBattle({ data: { id: sessionId } })
      .then((r) => { if (r.questions?.length) setQuestions(r.questions); })
      .catch((e: Error) => toast.error(failMessage(e, "Failed to load more")))
      .finally(() => { fetchingRef.current = false; });
  }, [idx, questions.length, phase, sessionId]);

  const cur = questions[idx];
  const myCorrect = useMemo(
    () => questions.reduce((n, q) => (answers[q.id] === q.correct ? n + 1 : n), 0),
    [answers, questions],
  );
  const myName = profile?.full_name?.split(" ").slice(0, 2).join(" ") ?? "You";
  const streak = Number(profile?.streak ?? 0);

  // total elapsed for header clock (mm:ss)
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase !== "playing") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (start.isPending) {
    return <ArenaShell><CenterPanel><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-400" /><div className="mt-4 text-2xl font-bold text-white">Preparing arena…</div></CenterPanel></ArenaShell>;
  }

  if (phase === "idle") {
    return (
      <ArenaShell>
        <div className="mx-auto max-w-md space-y-5">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a0e1e] to-[#0d0a1a] p-6 shadow-[0_0_40px_rgba(236,72,153,0.15)]">
            <div className="flex items-center gap-2 text-rose-400">
              <Swords className="h-5 w-5" />
              <h1 className="text-xl font-black tracking-wide">1v1 LIVE BATTLES</h1>
            </div>
            <p className="mt-3 text-sm text-white/70">
              Challenge any student or get matched randomly. Answer questions faster and more accurately to win XP and climb ranks.
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-white/60">
              <li>• 10 NCERT questions · <span className="text-cyan-300">60 seconds each</span></li>
              <li>• Live head-to-head — most correct wins</li>
              <li>• Bot rival steps in if no human is around</li>
            </ul>
            <button
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-[0_0_30px_rgba(244,63,94,0.4)] transition-transform hover:scale-[1.02]"
              onClick={() => start.mutate()}
            >
              <Users className="mr-2 inline h-4 w-4" /> Find Rival
            </button>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-[11px] uppercase tracking-widest text-white/50">Have a room code?</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ENTER CODE"
                  maxLength={8}
                  className="flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-center font-mono text-sm tracking-[0.3em] text-cyan-300 placeholder:tracking-normal placeholder:text-white/30"
                />
                <button
                  onClick={() => joinRoom()}
                  className="rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-bold text-cyan-300 hover:bg-cyan-500/30"
                >Join</button>
              </div>
            </div>
          </div>
        </div>
      </ArenaShell>
    );
  }

  if (phase === "notfound") {
    return (
      <ArenaShell>
        <CenterPanel>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10">
            <Users className="h-8 w-8 text-rose-400" />
          </div>
          <div className="mt-4 text-2xl font-bold text-white">Player not found</div>
          <p className="mt-2 max-w-xs text-sm text-white/60">
            No live rival is available right now. Invite a friend to a custom room, or duel a bot rival.
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white/80">
            Room code: <span className="font-black tracking-widest text-cyan-300">{roomCode}</span>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <button
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(34,211,238,0.35)]"
              onClick={invite}
            >Invite a friend</button>
            <button
              className="rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(244,63,94,0.35)]"
              onClick={() => { setPhase("countdown"); setCountdown(3); }}
            >Play vs bot rival</button>
            <button
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
              onClick={() => setPhase("matching")}
            >Search again</button>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ENTER ROOM CODE"
                maxLength={8}
                className="flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-center font-mono text-sm tracking-[0.25em] text-cyan-300 placeholder:tracking-normal placeholder:text-white/30"
              />
              <button
                onClick={() => joinRoom()}
                className="rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-bold text-cyan-300 hover:bg-cyan-500/30"
              >Join</button>
            </div>
          </div>
        </CenterPanel>
      </ArenaShell>
    );
  }

  if (phase === "matching") {
    return (
      <ArenaShell>
        <CenterPanel>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400/10">
            <Users className="h-8 w-8 animate-pulse text-cyan-400" />
          </div>
          <div className="mt-4 text-2xl font-bold text-white">Finding rival{".".repeat(matchDots)}</div>
          <p className="mt-2 text-sm text-white/50">Scanning live players across India</p>
        </CenterPanel>
      </ArenaShell>
    );
  }

  if (phase === "countdown") {
    return (
      <ArenaShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <VsRow myName={myName} myRank={myRank} botName={bot?.name ?? "Rival"} botRank={bot?.rank ?? 0} />
          <div className="mt-8 animate-pulse text-7xl font-black text-rose-500 drop-shadow-[0_0_20px_rgba(244,63,94,0.6)]">
            {countdown > 0 ? countdown : "FIGHT!"}
          </div>
        </div>
      </ArenaShell>
    );
  }

  if (phase === "playing" && !cur) {
    return <ArenaShell><CenterPanel><Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-400" /><div className="mt-3 text-sm text-white/60">Loading next questions…</div></CenterPanel></ArenaShell>;
  }

  if (phase === "playing" && cur) {
    const subjectLabel = ((profile?.profession ?? "").toString().toUpperCase() || "MCQ") + " • NCERT";
    return (
      <ArenaShell>
        <div className="mx-auto max-w-md space-y-4">
          {/* battle card */}
          <div className="rounded-3xl border border-white/10 bg-[#0d0a1a]/80 p-5 shadow-[0_0_50px_rgba(99,102,241,0.15)]">
            {/* live header */}
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-rose-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                LIVE BATTLE
              </span>
              <span className="tabular-nums text-white/70">{mm}:{ss}</span>
            </div>

            {/* vs row */}
            <div className="mt-4">
              <VsRow myName={myName} myRank={myRank} botName={bot?.name ?? "Rival"} botRank={bot?.rank ?? 0} compact />
            </div>

            {/* Question box */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="text-[10px] font-bold tracking-widest text-white/40">{subjectLabel}</div>
              <div className="mt-2 text-[15px] leading-relaxed text-white"><Latex>{cur.question}</Latex></div>
            </div>

            {/* Options */}
            <div className="mt-4 space-y-2.5">
              {(["A", "B", "C", "D"] as const).map((l) => {
                const active = selected === l;
                return (
                  <button
                    key={l}
                    onClick={() => pick(l)}
                    disabled={!!selected}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition-all ${
                      active
                        ? "border-cyan-400 bg-cyan-400/10 text-white shadow-[0_0_20px_rgba(34,211,238,0.35)]"
                        : "border-white/10 bg-white/[0.03] text-white/85 hover:border-white/25"
                    }`}
                  >
                    <span className="flex-1"><span className="mr-2 font-bold text-white/60">{l})</span><Latex>{cur.options[l]}</Latex></span>
                    {active && <span className="ml-3 text-xs font-semibold text-emerald-400">✓ Selected</span>}
                  </button>
                );
              })}
            </div>

            {/* footer stats */}
            <div className="mt-5 flex items-center justify-between text-xs">
              <span className="text-white/60">Score: <span className="font-bold text-amber-400">{myCorrect * 100} XP</span></span>
              <span className="inline-flex items-center gap-1 text-white/60">
                <Timer className={`h-3.5 w-3.5 ${tick <= 10 ? "text-rose-400" : "text-cyan-400"}`} />
                <span className={`tabular-nums font-bold ${tick <= 10 ? "text-rose-400" : "text-white/80"}`}>{tick}s</span>
              </span>
              <span className="inline-flex items-center gap-1 text-white/60">
                Streak: <Flame className="h-3.5 w-3.5 text-orange-400" />
                <span className="font-bold text-orange-300">{streak}</span>
              </span>
            </div>
          </div>

          {/* progress */}
          <div className="flex items-center justify-between px-1 text-[11px] text-white/50">
            <span>Q {idx + 1} / {TOTAL}</span>
            <span>Rival: {botIdx}/{TOTAL}</span>
          </div>
        </div>
      </ArenaShell>
    );
  }

  const attemptedCount = questions.slice(0, TOTAL).filter((q) => answers[q.id]).length;
  const won = myCorrect > botCorrect;
  const tie = myCorrect === botCorrect;
  return (
    <ArenaShell>
      <div className="mx-auto max-w-md space-y-5 text-center">
        <div className="rounded-3xl border border-white/10 bg-[#0d0a1a]/80 p-6 shadow-[0_0_50px_rgba(244,63,94,0.2)]">
          <div className={`text-3xl font-black ${won ? "text-emerald-400" : tie ? "text-amber-300" : "text-rose-400"}`}>
            {won ? "Victory 🏆" : tie ? "Draw 🤝" : "Defeat 💥"}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <ResultCard name={myName} correct={myCorrect} total={TOTAL} accent="cyan" winner={won} />
            <ResultCard name={bot?.name ?? "Rival"} correct={botCorrect} total={TOTAL} accent="rose" winner={!won && !tie} />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <MiniStat label="Accuracy" value={`${attemptedCount ? Math.round((myCorrect / attemptedCount) * 100) : 0}%`} />
            <MiniStat label="Attempted" value={`${attemptedCount}/${TOTAL}`} />
            <MiniStat label="Time" value={`${mm}:${ss}`} />
          </div>

          <div className="mt-5 text-left">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">Your progress</div>
            <div className="flex flex-wrap gap-1.5">
              {questions.slice(0, TOTAL).map((q, i) => {
                const a = answers[q.id];
                const ok = a === q.correct;
                return (
                  <span
                    key={q.id}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                      !a ? "bg-white/10 text-white/60" : ok ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                    }`}
                  >{i + 1}</span>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex justify-center gap-2">
            <button
              className="rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-600 px-5 py-2 text-sm font-bold text-white shadow-[0_0_20px_rgba(244,63,94,0.4)]"
              onClick={() => start.mutate()}
            >Rematch</button>
            <button
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
              onClick={() => navigate({ to: "/battle" })}
            >Back to Arena</button>
          </div>
        </div>
      </div>
    </ArenaShell>
  );
}

/* ------------------------ Themed shell & building blocks ------------------ */

function ArenaShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="battle-live arena-live-bg -mx-4 -my-6 min-h-[calc(100vh-8rem)] px-4 py-6"
      style={{
        background:
          "radial-gradient(1200px 500px at 50% -20%, rgba(244,63,94,0.22), transparent 60%), radial-gradient(900px 500px at 20% 110%, rgba(34,211,238,0.18), transparent 60%), #060314",
      }}
    >
      <div className="arena-scanline" />
      {children}
    </div>
  );
}


function CenterPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-2xl border border-white/10 bg-[#0d0a1a]/80 p-8 text-center shadow-[0_0_40px_rgba(99,102,241,0.15)]">
        {children}
      </div>
    </div>
  );
}

function VsRow({
  myName, myRank, botName, botRank, compact,
}: { myName: string; myRank: number; botName: string; botRank: number; compact?: boolean }) {
  const size = compact ? "h-16 w-16 text-base" : "h-20 w-20 text-lg";
  return (
    <div className="flex items-center justify-center gap-6">
      <PlayerAvatar label="YOU" name={myName} rank={myRank} color="cyan" sizeClass={size} />
      <div className="text-3xl font-black text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.6)]">VS</div>
      <PlayerAvatar label="OPP" name={botName} rank={botRank} color="rose" sizeClass={size} />
    </div>
  );
}

function PlayerAvatar({
  label, name, rank, color, sizeClass,
}: { label: string; name: string; rank: number; color: "cyan" | "rose"; sizeClass: string }) {
  const bg = color === "cyan"
    ? "from-sky-400 to-blue-600 shadow-[0_0_30px_rgba(56,189,248,0.5)]"
    : "from-rose-400 to-red-600 shadow-[0_0_30px_rgba(244,63,94,0.5)]";
  const short = label === "YOU" ? "YOU" : initials(name);
  return (
    <div className="flex flex-col items-center">
      <div className={`${sizeClass} rounded-full bg-gradient-to-br ${bg} flex items-center justify-center font-black text-white`}>
        {short}
      </div>
      <div className="mt-2 max-w-[110px] truncate text-sm font-semibold text-white">{name}</div>
      <div className="text-[11px] font-medium text-amber-400">Rank #{rank}</div>
    </div>
  );
}

function ResultCard({
  name, correct, total, winner, accent,
}: { name: string; correct: number; total: number; winner: boolean; accent: "cyan" | "rose" }) {
  const border = winner
    ? accent === "cyan" ? "border-cyan-400/70 shadow-[0_0_25px_rgba(34,211,238,0.35)]" : "border-rose-400/70 shadow-[0_0_25px_rgba(244,63,94,0.35)]"
    : "border-white/10";
  const num = winner ? (accent === "cyan" ? "text-cyan-300" : "text-rose-300") : "text-white";
  return (
    <div className={`rounded-2xl border p-4 ${border} bg-black/30`}>
      <div className="truncate text-sm font-semibold text-white">{name}</div>
      <div className={`mt-1 text-3xl font-black ${num}`}>{correct * 100}</div>
      <div className="text-xs text-white/60">{correct}/{total} correct</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="text-base font-bold text-white">{value}</div>
      <div className="text-[11px] text-white/60">{label}</div>
    </div>
  );
}
