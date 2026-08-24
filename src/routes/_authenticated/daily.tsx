import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { XpProgress } from "@/components/XpProgress";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { getDailyChallenge, submitDailyChallenge } from "@/lib/daily.functions";
import { Button } from "@/components/ui/button";
import { Latex } from "@/components/Latex";
import { ChevronLeft, CalendarCheck, Loader2, Trophy, Lock } from "lucide-react";
import { TopperCoin } from "@/components/TopperCoin";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/daily")({
  head: () => ({
    meta: [
      { title: "Daily Challenge — Last Topper" },
      {
        name: "description",
        content:
          "One curated 10-question NCERT set every day. Earn Topper Coins and keep your streak alive.",
      },
      { property: "og:title", content: "Daily Challenge — Last Topper" },
      { property: "og:description", content: "10 fresh NCERT questions daily with coin rewards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DailyPage,
});

type Letter = "A" | "B" | "C" | "D";

function DailyPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, Letter>>({});
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<{
    correct: number;
    total: number;
    reward: number;
    xp_gained?: number;
  } | null>(null);

  const challenge = useQuery({
    queryKey: ["daily-challenge"],
    queryFn: () => getDailyChallenge(),
    retry: 1,
  });

  const submit = useMutation({
    mutationFn: () => submitDailyChallenge({ data: { challenge_id: challenge.data!.id, answers } }),
    onSuccess: (r) => {
      setResult({
        correct: r.correct,
        total: r.total,
        reward: r.reward,
        xp_gained: "xp_gained" in r ? r.xp_gained : 0,
      });
      if (!r.already) confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  const questions = challenge.data?.questions ?? [];
  const q = questions[idx];
  const done = result !== null || challenge.data?.attempted;
  const locked = !done && !!challenge.data?.locked;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => nav({ to: "/home" })}
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Today only</div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <CalendarCheck className="h-4 w-4 text-primary" /> Daily Challenge
            </h1>
          </div>
          {!done && questions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {idx + 1} / {questions.length}
            </span>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-6">
        {challenge.isLoading && (
          <div className="mantis-card flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing today's set…
          </div>
        )}
        {challenge.isError && (
          <div className="mantis-card p-6 text-sm">
            <p className="text-red-600">{(challenge.error as Error).message}</p>
            <Button className="mt-3" onClick={() => challenge.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {locked && challenge.data && (
          <div className="mantis-card p-6 text-center">
            <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-semibold">Daily limit reached</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You've used {challenge.data.quota_used} of {challenge.data.quota_limit} free questions
              today. Upgrade to Pro for unlimited practice, or come back tomorrow.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={() => nav({ to: "/home" })}>
                Back home
              </Button>
              <Button onClick={() => nav({ to: "/pricing" })}>Upgrade to Pro</Button>
            </div>
          </div>
        )}

        {done && challenge.data && (
          <div className="mantis-card p-6 text-center">
            <Trophy className="mx-auto h-8 w-8 text-amber-500" />
            <h2 className="mt-3 text-lg font-semibold">
              {result ? `${result.correct} / ${result.total} correct` : "Already completed today"}
            </h2>
            {result ? (
              <p className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
                Reward: <TopperCoin className="h-4 w-4" /> <b>{result.reward} TC</b> added to your
                wallet
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                You scored {challenge.data.correct_count} and earned {challenge.data.reward_tc} TC.
                Come back tomorrow!
              </p>
            )}
            <XpProgress className="mt-4 text-left" gained={result?.xp_gained} />
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={() => nav({ to: "/review" })}>
                Review mistakes
              </Button>
              <Button onClick={() => nav({ to: "/home" })}>Back home</Button>
            </div>
          </div>
        )}

        {!done && !locked && q && (
          <div className="space-y-4">
            <div className="mantis-card p-5">
              <Latex className="block text-sm leading-relaxed">{q.question}</Latex>
              <div className="mt-4 grid gap-2">
                {(["A", "B", "C", "D"] as const).map((l) => {
                  const chosen = answers[q.id] === l;
                  return (
                    <button
                      key={l}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: l }))}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${
                        chosen ? "border-primary bg-primary/10" : "hover:border-primary/40"
                      }`}
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {l}
                      </span>
                      <span className="flex-1">
                        <Latex>{q.options[l]}</Latex>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
                Prev
              </Button>
              {idx + 1 < questions.length ? (
                <Button onClick={() => setIdx((i) => i + 1)}>Next</Button>
              ) : (
                <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
                  {submit.isPending ? "Submitting…" : "Submit challenge"}
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
