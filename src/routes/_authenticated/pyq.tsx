import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { failMessage } from "@/lib/friendly-error";
import { toast } from "sonner";
import { getPyqOptions, startPyqQuiz } from "@/lib/pyq.functions";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pyq")({
  head: () => ({
    meta: [
      { title: "Previous Year Questions — Last Topper" },
      { name: "description", content: "Practice NEET and JEE past-year questions by exam and year, with explanations." },
      { property: "og:title", content: "Previous Year Questions — Last Topper" },
      { property: "og:description", content: "NEET/JEE PYQ practice sets by year." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PyqPage,
});

function PyqPage() {
  const nav = useNavigate();
  const [count, setCount] = useState(20);
  const options = useQuery({ queryKey: ["pyq-options"], queryFn: () => getPyqOptions() });

  const start = useMutation({
    mutationFn: (o: { exam: string; year: number | null }) =>
      startPyqQuiz({ data: { exam: o.exam, year: o.year, count } }),
    onSuccess: (r) => nav({ to: "/quiz/$sessionId", params: { sessionId: r.id } }),
    onError: (e: Error) =>
      toast.error(
        e.message === "PRO_REQUIRED"
          ? "Upgrade to Pro for sets larger than 20."
          : failMessage(e),
      ),
  });

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/home" })} aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Exam archive</div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <ScrollText className="h-4 w-4 text-primary" /> Previous Year Questions
            </h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-4 px-5 py-6">
        <div className="mantis-card p-4">
          <div className="text-xs font-medium text-muted-foreground">Questions per set</div>
          <div className="mt-2 flex gap-2">
            {[10, 20, 50].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${count === n ? "border-primary bg-primary/10 text-primary" : ""}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {options.isLoading && (
          <div className="mantis-card flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading exam archive…
          </div>
        )}

        {options.data && options.data.length === 0 && (
          <div className="mantis-card p-6 text-center text-sm text-muted-foreground">
            No past-year questions uploaded yet. An admin can add them from Admin → Bank with
            <code className="mx-1 rounded bg-muted px-1">exam</code> and
            <code className="mx-1 rounded bg-muted px-1">exam_year</code> fields.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(options.data ?? []).map((o) => (
            <button
              key={`${o.exam}-${o.year ?? "all"}`}
              onClick={() => start.mutate({ exam: o.exam, year: o.year })}
              disabled={start.isPending}
              className="mantis-tile flex items-center justify-between p-4 text-left"
            >
              <div>
                <div className="text-sm font-semibold">{o.exam} {o.year ?? ""}</div>
                <div className="text-xs text-muted-foreground">{o.count} questions available</div>
              </div>
              {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs text-primary">Start</span>}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
