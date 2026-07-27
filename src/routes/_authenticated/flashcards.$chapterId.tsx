import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getChapterTopics, getTopicRevision } from "@/lib/revise.functions";
import { Button } from "@/components/ui/button";
import { Latex } from "@/components/Latex";
import { ChevronLeft, ChevronRight, Layers, Loader2, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/flashcards/$chapterId")({
  head: () => ({
    meta: [
      { title: "Formula Flashcards — Last Topper" },
      { name: "description", content: "Flip through NCERT formulas and key points chapter by chapter." },
      { property: "og:title", content: "Formula Flashcards — Last Topper" },
      { property: "og:description", content: "Rapid-fire formula and key-point recall cards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FlashcardsPage,
});

type Card = { front: string; back: string; topic: string };

function FlashcardsPage() {
  const { chapterId } = Route.useParams();
  const nav = useNavigate();
  const [topicIdx, setTopicIdx] = useState(0);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const topics = useQuery({
    queryKey: ["revise-topics", chapterId],
    queryFn: () => getChapterTopics({ data: { chapter_id: chapterId } }),
  });

  const topicList = topics.data?.topics ?? [];
  const activeTopic = topicList[topicIdx];

  const revision = useQuery({
    queryKey: ["revise-topic", activeTopic?.id],
    queryFn: () => getTopicRevision({ data: { topic_id: activeTopic!.id } }),
    enabled: !!activeTopic?.id,
  });

  const cards: Card[] = useMemo(() => {
    const t = revision.data;
    if (!t) return [];
    const out: Card[] = [];
    for (const f of t.formulas ?? []) {
      out.push({ topic: t.title, front: f.name ?? "Formula", back: `${f.expression ?? ""}${f.note ? `\n\n${f.note}` : ""}` });
    }
    for (const p of t.key_points ?? []) {
      const text = typeof p === "string" ? p : String(p);
      const [head, ...rest] = text.split(/[:—-]\s/);
      out.push({ topic: t.title, front: rest.length ? head : `Recall: ${t.title}`, back: rest.length ? rest.join(" ") : text });
    }
    return out;
  }, [revision.data]);

  useEffect(() => { setCardIdx(0); setFlipped(false); }, [topicIdx, revision.data]);

  const card = cards[cardIdx];

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/revise/$chapterId", params: { chapterId } })} aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">{topics.data?.chapter?.name ?? "Chapter"}</div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <Layers className="h-4 w-4 text-primary" /> Flashcards
            </h1>
          </div>
          {cards.length > 0 && <span className="text-xs text-muted-foreground">{cardIdx + 1} / {cards.length}</span>}
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-4 px-5 py-6">
        {topicList.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {topicList.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setTopicIdx(i)}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
                  i === topicIdx ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
        )}

        {(topics.isLoading || revision.isLoading) && (
          <div className="mantis-card flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building flashcards…
          </div>
        )}

        {!revision.isLoading && cards.length === 0 && (
          <div className="mantis-card p-6 text-center text-sm text-muted-foreground">
            No formulas or key points for this topic yet.
          </div>
        )}

        {card && (
          <>
            <button
              onClick={() => setFlipped((f) => !f)}
              className="mantis-card flex min-h-[220px] w-full flex-col items-center justify-center gap-3 p-6 text-center"
            >
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {flipped ? "Answer" : "Tap to reveal"}
              </span>
              <Latex className="block text-base font-medium leading-relaxed">
                {flipped ? card.back : card.front}
              </Latex>
            </button>
            <div className="flex items-center justify-between">
              <Button variant="outline" disabled={cardIdx === 0} onClick={() => { setCardIdx((i) => i - 1); setFlipped(false); }}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Prev
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFlipped((f) => !f)}>
                <RotateCcw className="mr-1 h-4 w-4" /> Flip
              </Button>
              <Button
                disabled={cardIdx + 1 >= cards.length}
                onClick={() => { setCardIdx((i) => i + 1); setFlipped(false); }}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
