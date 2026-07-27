import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getQuizSession,
  submitQuizSession,
  heartbeatSession,
  extendQuizSession,
  type QuizQuestion,
} from "@/lib/learning.functions";
import { useQuizStore, type Answer } from "@/store/quiz";
import { useHideAds } from "@/lib/useHideAds";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Latex } from "@/components/Latex";
import { ChevronLeft, ChevronRight, Lightbulb, Timer, Loader2 } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/quiz/$sessionId")({
  head: () => ({
    meta: [
      { title: "Quiz — Last Topper" },
      { name: "description", content: "Attempt your AI-generated practice quiz." },
      { property: "og:title", content: "Quiz — Last Topper" },
      { property: "og:description", content: "Timed practice mode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  useHideAds();
  const { sessionId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: ["quiz-session", sessionId],
    queryFn: () => getQuizSession({ data: { id: sessionId } }),
    staleTime: Infinity,
  });

  const questions = (session?.questions as QuizQuestion[] | undefined) ?? [];
  const targetCount = session?.question_count ?? questions.length;
  const timerEnabled = !!session?.timer_enabled;
  const duration = session?.duration_seconds ?? null;
  const startTimeMs = session?.start_time ? new Date(session.start_time).getTime() : Date.now();
  const alreadySubmitted = !!session?.submitted_at;

  const init = useQuizStore((s) => s.init);
  const setAnswer = useQuizStore((s) => s.setAnswer);
  const setIndex = useQuizStore((s) => s.setIndex);
  const clearSession = useQuizStore((s) => s.clearSession);
  const state = useQuizStore((s) => s.sessions[sessionId]);

  useEffect(() => {
    if (session) init(sessionId);
  }, [session, sessionId, init]);

  // Redirect to results if session was auto-submitted server-side while away
  useEffect(() => {
    if (alreadySubmitted) {
      nav({ to: "/results/$sessionId", params: { sessionId }, replace: true });
    }
  }, [alreadySubmitted, nav, sessionId]);

  // Heartbeat every 30s while the quiz is open
  useEffect(() => {
    if (!session || alreadySubmitted) return;
    const send = () => {
      void heartbeatSession({ data: { id: sessionId } }).catch(() => {});
    };
    send();
    const t = setInterval(send, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session, alreadySubmitted, sessionId]);

  const [showHint, setShowHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const idx = state?.currentIndex ?? 0;
  const answers = state?.answers ?? {};
  const q = questions[idx];
  const needsMore = !alreadySubmitted && questions.length < targetCount;
  const fetchingRef = useRef(false);

  // Progressive prefetch: when we near the end of loaded questions, fetch next batch.
  useEffect(() => {
    if (!needsMore || fetchingRef.current) return;
    if (idx < questions.length - 2 && questions.length > 0) return;
    fetchingRef.current = true;
    extendQuizSession({ data: { id: sessionId } })
      .then((r) => {
        if (r.added > 0) qc.invalidateQueries({ queryKey: ["quiz-session", sessionId] });
      })
      .catch((e) => toast.error(failMessage(e, "Failed to load more")))
      .finally(() => { fetchingRef.current = false; });
  }, [idx, questions.length, needsMore, sessionId, qc]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.floor((now - startTimeMs) / 1000);
  const remaining = timerEnabled && duration ? Math.max(0, duration - elapsed) : null;

  async function handleSubmit(auto = false) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const timeTaken = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
      await submitQuizSession({
        data: { id: sessionId, answers: answers as Record<string, Answer>, time_taken_seconds: timeTaken },
      });
      clearSession(sessionId);
      if (auto) toast.info("Time's up — auto-submitted");
      nav({ to: "/results/$sessionId", params: { sessionId } });
    } catch (e) {
      submittedRef.current = false;
      toast.error(failMessage(e, "Failed to submit"));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (remaining === 0 && timerEnabled) void handleSubmit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, timerEnabled]);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) {
    return <div className="p-6 text-sm">Session not found.</div>;
  }
  if (!q) return null;

  const selected = answers[q.id];

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/learning" })} aria-label="Exit">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-xs font-medium text-muted-foreground">
            Q {idx + 1} / {targetCount}
          </div>
          {remaining != null ? (
            <div className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Timer className="h-3.5 w-3.5" />
              {formatTime(remaining)}
            </div>
          ) : (
            <div className="w-16" />
          )}
        </div>
        <Progress value={((idx + 1) / targetCount) * 100} className="h-1 rounded-none" />
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        <div className="rounded-2xl border bg-card p-5">
          <Latex className="block text-base leading-relaxed">{q.question}</Latex>
          <div className="mt-4 space-y-2">
            {(["A", "B", "C", "D"] as const).map((k) => {
              const isSel = selected === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setAnswer(sessionId, q.id, k);
                    setShowHint(false);
                  }}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    isSel ? "border-primary bg-primary/5" : "hover:bg-accent"
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      isSel ? "border-primary bg-primary text-primary-foreground" : ""
                    }`}
                  >
                    {k}
                  </span>
                  <Latex className="block flex-1 text-sm">{q.options[k]}</Latex>
                </button>
              );
            })}
          </div>

          {showHint && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <Lightbulb className="h-4 w-4" /> Hint
              </div>
              <div className="mt-1">
                <Latex>{q.hint}</Latex>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 h-8 text-xs"
            onClick={() => setShowHint((s) => !s)}
          >
            <Lightbulb className="mr-1 h-3.5 w-3.5" />
            {showHint ? "Hide hint" : "Show hint"}
          </Button>
        </div>
      </section>

      <footer className="sticky bottom-0 border-t bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <Button
            variant="outline"
            onClick={() => setIndex(sessionId, Math.max(0, idx - 1))}
            disabled={idx === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Prev
          </Button>
          <div className="text-xs text-muted-foreground">
            {answeredCount} / {targetCount} answered
          </div>
          {idx < targetCount - 1 ? (
            <Button
              onClick={() => setIndex(sessionId, idx + 1)}
              disabled={idx + 1 >= questions.length}
            >
              {idx + 1 >= questions.length ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Loading</>
              ) : (
                <>Next <ChevronRight className="ml-1 h-4 w-4" /></>
              )}
            </Button>
          ) : (
            <Button onClick={() => handleSubmit(false)} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish"}
            </Button>
          )}
        </div>
      </footer>
    </main>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
