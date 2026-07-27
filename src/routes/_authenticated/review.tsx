import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getReviewQueue, gradeReview } from "@/lib/review.functions";
import { Button } from "@/components/ui/button";
import { Latex } from "@/components/Latex";
import { ChevronLeft, Repeat2, Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "Spaced Repetition — Last Topper" },
      { name: "description", content: "Your missed questions resurface on day 1, 3, 7, 16 and 35 until you master them." },
      { property: "og:title", content: "Spaced Repetition — Last Topper" },
      { property: "og:description", content: "Fix weak chapters with scheduled recall practice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

type Letter = "A" | "B" | "C" | "D";

function ReviewPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["review-queue"], queryFn: () => getReviewQueue() });
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<Letter | null>(null);

  const grade = useMutation({
    mutationFn: (correct: boolean) => gradeReview({ data: { id: queue.data!.due[pos].id, correct } }),
    onSuccess: () => {
      setPicked(null);
      setPos((p) => p + 1);
      qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const item = queue.data?.due[pos];

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/home" })} aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Smart recall</div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <Repeat2 className="h-4 w-4 text-primary" /> Spaced repetition
            </h1>
          </div>
          {queue.data && (
            <span className="text-xs text-muted-foreground">
              {Math.max(0, queue.data.dueCount - pos)} due · {queue.data.total} tracked
            </span>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-6">
        {queue.isLoading && (
          <div className="mantis-card flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building your review queue…
          </div>
        )}

        {!queue.isLoading && !item && (
          <div className="mantis-card p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <h2 className="mt-3 text-lg font-semibold">Nothing due right now</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Missed questions come back on day 1, 3, 7, 16 and 35. Keep practising and they'll appear here.
            </p>
            <Button className="mt-4" onClick={() => nav({ to: "/learning" })}>Practice a chapter</Button>
          </div>
        )}

        {item && (
          <div className="space-y-4">
            <div className="mantis-card p-5">
              <div className="mb-2 text-xs text-muted-foreground">Box {item.box} of 5</div>
              <Latex className="block text-sm leading-relaxed">{item.question.question}</Latex>
              <div className="mt-4 grid gap-2">
                {(["A", "B", "C", "D"] as const).map((l) => {
                  const isPicked = picked === l;
                  const reveal = picked !== null;
                  const isCorrect = item.question.correct === l;
                  return (
                    <button
                      key={l}
                      disabled={reveal}
                      onClick={() => setPicked(l)}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${
                        reveal && isCorrect
                          ? "border-emerald-500 bg-emerald-500/10"
                          : reveal && isPicked
                            ? "border-red-500 bg-red-500/10"
                            : "hover:border-primary/40"
                      }`}
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">{l}</span>
                      <span className="flex-1"><Latex>{item.question.options[l]}</Latex></span>
                    </button>
                  );
                })}
              </div>

              {picked && (
                <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
                  <Latex className="block">{item.question.explanation}</Latex>
                </div>
              )}
            </div>

            {picked && (
              <Button
                className="w-full"
                disabled={grade.isPending}
                onClick={() => grade.mutate(picked === item.question.correct)}
              >
                {grade.isPending ? "Saving…" : "Next question"}
              </Button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
