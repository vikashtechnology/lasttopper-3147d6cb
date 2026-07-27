import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getChapterTopics, getTopicRevision, type ReviseTopic } from "@/lib/revise.functions";
import { Button } from "@/components/ui/button";
import { Latex, Formula } from "@/components/Latex";
import { ChevronLeft, ChevronDown, Loader2, ExternalLink, Sparkles, BookMarked } from "lucide-react";

export const Route = createFileRoute("/_authenticated/revise/$chapterId")({
  head: () => ({
    meta: [
      { title: "Chapter revision — Last Topper" },
      { name: "description", content: "NCERT revision notes with cited references." },
      { property: "og:title", content: "Chapter revision — Last Topper" },
      { property: "og:description", content: "NCERT revision notes with cited references." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["revise-topics", params.chapterId],
      queryFn: () => getChapterTopics({ data: { chapter_id: params.chapterId } }),
    }),
  errorComponent: ReviseError,
  component: ChapterRevisePage,
});

function ReviseError({ error, reset }: { error: Error; reset: () => void }) {
  const nav = useNavigate();

  return (
    <main className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">Revision could not load</h1>
          <p className="mt-1 text-sm text-muted-foreground">{error.message || "Please try again."}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={reset}>Retry</Button>
          <Button variant="outline" onClick={() => nav({ to: "/revise" })}>
            Back
          </Button>
        </div>
      </div>
    </main>
  );
}

function ChapterRevisePage() {
  const { chapterId } = Route.useParams();
  const nav = useNavigate();
  const { data } = useSuspenseQuery({
    queryKey: ["revise-topics", chapterId],
    queryFn: () => getChapterTopics({ data: { chapter_id: chapterId } }),
  });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/revise" })} aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold flex items-center gap-2">
              <BookMarked className="h-4 w-4 text-primary" />
              {data.chapter?.name ?? "Chapter"}
            </div>
            <div className="text-xs text-muted-foreground">
              {data.topics.length} revision topics
              {data.chapter?.class_level ? ` • Class ${data.chapter.class_level}` : ""}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-4 pb-24 space-y-2.5">
        {data.topics.length === 0 && (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            No topics available yet for this chapter.
          </div>
        )}
        {data.topics.map((t, i) => (
          <TopicCard
            key={t.id}
            topic={t}
            index={i + 1}
            open={openId === t.id}
            onToggle={() => setOpenId(openId === t.id ? null : t.id)}
          />
        ))}
        <p className="pt-4 text-center text-[11px] text-muted-foreground">
          Revision notes are AI summaries written in our own words. Reference links point to third-party sources
          (NCERT, Unacademy, Vedantu, Oswaal, BYJU'S) for further reading — all rights belong to the respective owners.
        </p>
      </section>
    </main>
  );
}

function TopicCard({
  topic,
  index,
  open,
  onToggle,
}: {
  topic: ReviseTopic;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<ReviseTopic>(topic);
  const needsFetch = !detail.summary;

  const mut = useMutation({
    mutationFn: () => getTopicRevision({ data: { topic_id: topic.id } }),
    onSuccess: (fresh) => {
      setDetail(fresh);
      qc.setQueryData<{ chapter: unknown; topics: ReviseTopic[] } | undefined>(
        ["revise-topics", topic.chapter_id],
        (prev) =>
          prev
            ? { ...prev, topics: prev.topics.map((t) => (t.id === fresh.id ? fresh : t)) }
            : prev,
      );
    },
  });

  function handleClick() {
    onToggle();
    if (!open && needsFetch && !mut.isPending) mut.mutate();
  }

  return (
    <div className="mantis-card overflow-hidden">
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
            {index}
          </span>
          <span className="truncate text-sm font-semibold">{topic.title}</span>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t bg-muted/30 px-4 py-4">
          {mut.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing revision & references…
            </div>
          )}
          {mut.isError && (
            <div className="text-sm text-red-600">
              {(mut.error as Error).message}
              <Button size="sm" variant="outline" className="ml-2" onClick={() => mut.mutate()}>
                Retry
              </Button>
            </div>
          )}
          {!mut.isPending && detail.summary && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Revision note
              </div>
              <Latex className="block leading-relaxed text-foreground">{detail.summary}</Latex>

              {detail.key_points?.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Key points
                  </div>
                  <ul className="space-y-1.5 pl-4">
                    {detail.key_points.map((k, i) => (
                      <li key={i} className="list-disc leading-relaxed">
                        <Latex>{k}</Latex>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.formulas?.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Formulas / reactions
                  </div>
                  <div className="divide-y rounded-lg border bg-background">
                    {detail.formulas.map((f, i) => (
                      <div key={i} className="px-3 py-2.5">
                        <Formula>{f}</Formula>
                      </div>
                    ))}
                  </div>
                </div>
              )}


              {detail.refs?.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    References
                  </div>
                  <ul className="space-y-1.5">
                    {detail.refs.map((r, i) => (
                      <li key={i}>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="group flex items-start gap-2 rounded-md border bg-background p-2 text-xs hover:border-primary/40"
                        >
                          <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                            {r.source.split(".")[0]}
                          </span>
                          <span className="flex-1 truncate group-hover:text-primary">{r.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
