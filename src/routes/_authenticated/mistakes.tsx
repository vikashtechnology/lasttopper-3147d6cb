import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMistakes, createQuizSession, type QuizQuestion } from "@/lib/learning.functions";
import { Button } from "@/components/ui/button";
import { Latex } from "@/components/Latex";
import { ChevronLeft, Repeat, XCircle } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

const mistakesQuery = {
  queryKey: ["mistakes"] as const,
  queryFn: () => getMistakes(),
};

export const Route = createFileRoute("/_authenticated/mistakes")({
  head: () => ({
    meta: [
      { title: "Mistake Bank — Last Topper" },
      { name: "description", content: "All the questions you've gotten wrong, in one place." },
      { property: "og:title", content: "Mistake Bank — Last Topper" },
      { property: "og:description", content: "Practice your past mistakes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mistakesQuery),
  component: MistakesPage,
});

function MistakesPage() {
  const nav = useNavigate();
  const { data } = useSuspenseQuery(mistakesQuery);
  const [starting, setStarting] = useState(false);

  // Dedupe by question id, keep most recent
  const unique = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof data = [];
    for (const m of data) {
      if (seen.has(m.question.id)) continue;
      seen.add(m.question.id);
      out.push(m);
    }
    return out;
  }, [data]);

  async function practiceAll() {
    if (unique.length === 0) return;
    setStarting(true);
    try {
      const questions: QuizQuestion[] = unique.map((m, i) => ({
        ...m.question,
        id: `mistake_${Date.now()}_${i}`,
      }));
      const chapterIds = Array.from(new Set(questions.map((q) => q.chapter_id))).filter(Boolean);
      if (chapterIds.length === 0) {
        toast.error("No chapters found for your mistakes");
        return;
      }
      const s = await createQuizSession({
        data: {
          chapter_ids: chapterIds,
          question_count: questions.length,
          questions,
          timer_enabled: false,
          duration_seconds: null,
        },
      });
      nav({ to: "/quiz/$sessionId", params: { sessionId: s.id } });
    } catch (e) {
      toast.error(failMessage(e, "Failed"));
    } finally {
      setStarting(false);
    }
  }

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
            <div className="text-xs text-muted-foreground">Weak areas</div>
            <div className="text-base font-semibold">Mistake bank</div>
          </div>
          {unique.length > 0 && (
            <Button size="sm" onClick={practiceAll} disabled={starting}>
              <Repeat className="mr-1 h-4 w-4" /> Practice all
            </Button>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-6">
        {unique.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No mistakes yet. Nice work — keep going!
          </div>
        ) : (
          <ul className="space-y-2">
            {unique.map((m) => (
              <li key={m.question.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div className="flex-1">
                    <Latex className="block text-sm">{m.question.question}</Latex>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Your answer: <span className="font-medium">{m.chosen ?? "—"}</span> · Correct:{" "}
                      <span className="font-medium">{m.question.correct}</span>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-primary">
                        Show explanation
                      </summary>
                      <div className="mt-2 rounded-md bg-muted p-3 text-sm">
                        <Latex className="block">{m.question.explanation}</Latex>
                      </div>
                    </details>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
