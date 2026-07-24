import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getQuizHistory } from "@/lib/learning.functions";
import { Button } from "@/components/ui/button";
import { ChevronLeft, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

const historyQuery = {
  queryKey: ["quiz-history"] as const,
  queryFn: () => getQuizHistory(),
};

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "History — Last Topper" },
      { name: "description", content: "Every quiz you've attempted." },
      { property: "og:title", content: "History — Last Topper" },
      { property: "og:description", content: "Review your past attempts and scores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(historyQuery),
  component: HistoryPage,
});

function HistoryPage() {
  const nav = useNavigate();
  const { data } = useSuspenseQuery(historyQuery);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/home" })} aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Attempts</div>
            <div className="text-base font-semibold">Quiz history</div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-6">
        {data.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No quizzes yet. Start one from Learning.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent cursor-pointer"
                onClick={() => nav({ to: "/results/$sessionId", params: { sessionId: r.id } })}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {Number(r.accuracy ?? 0).toFixed(1)}%
                    {r.was_auto_submitted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                        <AlertCircle className="h-3 w-3" /> auto
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {r.correct_count ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <XCircle className="h-3.5 w-3.5" /> {r.incorrect_count ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {Math.round((r.time_taken_seconds ?? 0) / 60)}m
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
