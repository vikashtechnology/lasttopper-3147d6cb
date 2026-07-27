import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Timer } from "lucide-react";
import { Latex } from "@/components/Latex";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { getBattleSession, submitBattle } from "@/lib/battle.functions";
import type { QuizQuestion } from "@/lib/learning.functions";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/battle/play/$sessionId")({
  head: () => ({
    meta: [
      { title: "Mega Test — Last Topper" },
      { name: "description", content: "Sunday Mega Test in progress." },
      { property: "og:title", content: "Mega Test" },
      { property: "og:description", content: "180-question 3-hour Sunday battle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MegaPlay,
});

function MegaPlay() {
  useAntiCheat(true);
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const sq = useQuery({
    queryKey: ["battle-session", sessionId],
    queryFn: () => getBattleSession({ data: { id: sessionId } }),
  });
  const [answers, setAnswers] = useState<Record<string, "A" | "B" | "C" | "D">>({});
  const [idx, setIdx] = useState(0);
  const startRef = useRef<number>(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const questions = useMemo(() => (sq.data?.questions as QuizQuestion[] | undefined) ?? [], [sq.data]);
  const endsAt = sq.data ? new Date(sq.data.start_time).getTime() + 3 * 60 * 60 * 1000 : 0;
  const remaining = Math.max(0, endsAt - now);
  const submitted = !!sq.data?.submitted_at;

  useEffect(() => {
    if (sq.data && !submitted) startRef.current = new Date(sq.data.start_time).getTime();
  }, [sq.data, submitted]);

  const submit = useMutation({
    mutationFn: (auto: boolean) => {
      const elapsed = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000));
      return submitBattle({ data: { id: sessionId, answers, time_taken_seconds: elapsed } })
        .then((r) => ({ ...r, auto }));
    },
    onSuccess: (res) => {
      if (!res.auto) confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
      toast.success(res.auto ? "Time's up — auto-submitted" : "Submitted!");
      navigate({ to: "/battle/history" });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  useEffect(() => {
    if (!sq.data || submitted) return;
    if (remaining <= 0 && !submit.isPending) submit.mutate(true);
  }, [remaining, sq.data, submitted, submit]);

  if (sq.isLoading || !sq.data) return <div className="text-white/60 text-sm">Loading…</div>;
  if (submitted) {
    return (
      <div className="battle-glass p-6 text-center">
        <p className="battle-title text-xl">Already submitted</p>
        <button className="battle-btn mt-4" onClick={() => navigate({ to: "/battle/history" })}>See history</button>
      </div>
    );
  }
  const q = questions[idx];
  if (!q) return <div className="text-white/60 text-sm">No question.</div>;

  const answered = Object.keys(answers).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>Q {idx + 1} / {questions.length} · {answered} answered</span>
        <span className={`inline-flex items-center gap-1.5 ${remaining < 60000 ? "text-red-400" : ""}`}>
          <Timer className="h-4 w-4" /> {fmtHMS(remaining)}
        </span>
      </div>
      <div className="battle-glass battle-slide-up p-5">
        <div className="text-base leading-relaxed"><Latex>{q.question}</Latex></div>
        <div className="mt-4 grid gap-2">
          {(["A", "B", "C", "D"] as const).map((l) => {
            const chosen = answers[q.id] === l;
            return (
              <button
                key={l}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: l }))}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  chosen ? "border-cyan-400/70 bg-cyan-400/10" : "border-white/10 bg-white/[0.03] hover:border-cyan-400/40"
                }`}
              >
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{l}</span>
                <span className="flex-1 text-sm"><Latex>{q.options[l]}</Latex></span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >Prev</button>
        {idx + 1 < questions.length ? (
          <button className="battle-btn" onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}>Next</button>
        ) : (
          <button className="battle-btn" disabled={submit.isPending} onClick={() => submit.mutate(false)}>
            {submit.isPending ? "Submitting…" : "Submit test"}
          </button>
        )}
      </div>
    </div>
  );
}

function fmtHMS(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}
