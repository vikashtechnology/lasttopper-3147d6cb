import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { failMessage } from "@/lib/friendly-error";
import { toast } from "sonner";
import { getPyqOptions, startPyqQuiz } from "@/lib/pyq.functions";
import { getMyProfile } from "@/lib/user.functions";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, Lock, ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pyq")({
  head: () => ({
    meta: [
      { title: "Previous Year Questions — Last Topper" },
      {
        name: "description",
        content: "Practice NEET and JEE past-year questions by exam and year, with explanations.",
      },
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
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getMyProfile() });
  const isPro = !!profile.data?.is_pro;

  const start = useMutation({
    mutationFn: (o: { exam: string; year: number | null }) =>
      startPyqQuiz({ data: { exam: o.exam, year: o.year, count } }),
    onSuccess: (r) => nav({ to: "/quiz/$sessionId", params: { sessionId: r.id } }),
    onError: (e: Error) =>
      toast.error(
        e.message === "PRO_REQUIRED" ? "Upgrade to Pro for sets larger than 20." : failMessage(e),
      ),
  });

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
            {[10, 20, 50].map((n) => {
              const locked = n > 20 && !isPro;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    if (locked) {
                      toast.info("50-question PYQ sets are available with Pro.", {
                        action: { label: "View plans", onClick: () => nav({ to: "/pricing" }) },
                      });
                      return;
                    }
                    setCount(n);
                  }}
                  aria-pressed={count === n}
                  aria-label={`${n} questions${locked ? " — Pro" : ""}`}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    count === n
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:border-primary/40 hover:bg-accent"
                  } ${locked ? "text-muted-foreground" : ""}`}
                >
                  {n}
                  {locked && (
                    <>
                      <Lock className="h-3 w-3" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide">Pro</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {options.isLoading && (
          <div className="mantis-card flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading exam archive…
          </div>
        )}

        {options.isError && (
          <div className="mantis-card p-6 text-center">
            <h2 className="text-sm font-semibold">The exam archive did not load</h2>
            <p className="mt-1 text-sm text-muted-foreground">{failMessage(options.error)}</p>
            <Button className="mt-4" variant="outline" onClick={() => options.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {options.isSuccess && options.data.length === 0 && (
          <div className="mantis-card p-6 text-center">
            <ScrollText className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">Past-year sets are being prepared</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              No PYQ collection is available yet. You can continue with chapter practice or revision
              notes in the meantime.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => nav({ to: "/revise" })}>
                Revise
              </Button>
              <Button onClick={() => nav({ to: "/learning" })}>Start chapter practice</Button>
            </div>
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
                <div className="text-sm font-semibold">
                  {o.exam} {o.year ?? ""}
                </div>
                <div className="text-xs text-muted-foreground">{o.count} questions available</div>
              </div>
              {start.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="text-xs text-primary">Start</span>
              )}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
