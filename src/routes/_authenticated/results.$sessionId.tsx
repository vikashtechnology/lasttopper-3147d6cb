import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getQuizSession,
  createQuizSession,
  type QuizQuestion,
} from "@/lib/learning.functions";
import { Button } from "@/components/ui/button";
import { Latex } from "@/components/Latex";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Home, Repeat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/results/$sessionId")({
  head: () => ({
    meta: [
      { title: "Results — Last Topper" },
      { name: "description", content: "Your quiz results and review." },
      { property: "og:title", content: "Results — Last Topper" },
      { property: "og:description", content: "Review your answers and explanations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["quiz-session", params.sessionId],
      queryFn: () => getQuizSession({ data: { id: params.sessionId } }),
    }),
  component: ResultsPage,
});

function ResultsPage() {
  const { sessionId } = Route.useParams();
  const nav = useNavigate();
  const { data: session } = useSuspenseQuery({
    queryKey: ["quiz-session", sessionId],
    queryFn: () => getQuizSession({ data: { id: sessionId } }),
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);

  const questions = useMemo(
    () => (session?.questions as QuizQuestion[] | undefined) ?? [],
    [session],
  );
  const answers = (session?.answers as Record<string, "A" | "B" | "C" | "D"> | undefined) ?? {};

  if (!session) return <div className="p-6 text-sm">Not found.</div>;

  const total = questions.length;
  const correct = session.correct_count ?? 0;
  const incorrect = session.incorrect_count ?? total - correct;
  const accuracy = Number(session.accuracy ?? 0);
  const timeTaken = session.time_taken_seconds ?? 0;

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function practiceIncorrect() {
    const wrong = questions.filter((q) => answers[q.id] !== q.correct);
    if (wrong.length === 0) {
      toast.success("No incorrect answers!");
      return;
    }
    setStarting(true);
    try {
      const chapterIds = Array.from(new Set(wrong.map((q) => q.chapter_id))).filter(Boolean);
      const s = await createQuizSession({
        data: {
          chapter_ids: chapterIds,
          question_count: wrong.length,
          questions: wrong.map((q, i) => ({ ...q, id: `${q.id}_r${i}` })),
          timer_enabled: false,
          duration_seconds: null,
        },
      });
      nav({ to: "/quiz/$sessionId", params: { sessionId: s.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div>
            <div className="text-xs text-muted-foreground">Quiz complete</div>
            <div className="text-base font-semibold">Your results</div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/home" })} aria-label="Home">
            <Home className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 pt-6">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Accuracy</div>
          <div className="mt-1 text-4xl font-bold">{accuracy.toFixed(1)}%</div>
          <div className="mt-4 grid grid-cols-4 gap-3 text-center">
            <Stat label="Total" value={total} />
            <Stat label="Correct" value={correct} tone="pos" />
            <Stat label="Wrong" value={incorrect} tone="neg" />
            <Stat label="Time" value={formatTime(timeTaken)} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={practiceIncorrect} disabled={starting || incorrect === 0}>
              <Repeat className="mr-2 h-4 w-4" /> Practice incorrect
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => nav({ to: "/learning" })}>
              New quiz
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Review</h2>
        <ul className="space-y-2">
          {questions.map((q, i) => {
            const chosen = answers[q.id];
            const ok = chosen === q.correct;
            const isOpen = expanded.has(q.id);
            return (
              <li key={q.id} className="rounded-xl border bg-card">
                <button
                  type="button"
                  onClick={() => toggle(q.id)}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  {ok ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  )}
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Q{i + 1}</div>
                    <Latex className="mt-0.5 block text-sm">{q.question}</Latex>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Your answer: <span className="font-medium">{chosen ?? "—"}</span> · Correct:{" "}
                      <span className="font-medium">{q.correct}</span>
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {isOpen && (
                  <div className="border-t p-4">
                    <div className="space-y-1.5 text-sm">
                      {(["A", "B", "C", "D"] as const).map((k) => (
                        <div
                          key={k}
                          className={`flex gap-2 rounded-md p-2 ${
                            k === q.correct
                              ? "bg-emerald-50 text-emerald-900"
                              : k === chosen
                              ? "bg-red-50 text-red-900"
                              : ""
                          }`}
                        >
                          <span className="font-semibold">{k}.</span>
                          <Latex className="block flex-1">{q.options[k]}</Latex>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                      <div className="mb-1 text-xs font-semibold text-muted-foreground">Explanation</div>
                      <Latex className="block">{q.explanation}</Latex>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-red-600" : "text-foreground";
  return (
    <div className="rounded-lg bg-muted p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
