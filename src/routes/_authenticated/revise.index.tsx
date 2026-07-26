import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getSubjectsWithChapters } from "@/lib/learning.functions";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronLeft, BookMarked, ChevronRight } from "lucide-react";

const subjectsQuery = {
  queryKey: ["subjects-with-chapters"] as const,
  queryFn: () => getSubjectsWithChapters(),
};

export const Route = createFileRoute("/_authenticated/revise/")({
  head: () => ({
    meta: [
      { title: "Revise — Last Topper" },
      { name: "description", content: "Quick NCERT revision notes for every chapter, with references." },
      { property: "og:title", content: "Revise — Last Topper" },
      { property: "og:description", content: "Concise NCERT revision notes per chapter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(subjectsQuery),
  component: RevisePage,
});

function RevisePage() {
  const nav = useNavigate();
  const { data: subjects } = useSuspenseQuery(subjectsQuery);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/home" })} aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="text-base font-semibold flex items-center gap-2">
              <BookMarked className="h-4 w-4 text-primary" /> Revise
            </div>
            <div className="text-xs text-muted-foreground">
              Concise NCERT topic notes with references from Unacademy, Vedantu, Oswaal &amp; more
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 pt-4 pb-24">
        {subjects.length === 0 ? (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            Complete onboarding to see chapters.
          </div>
        ) : (
          <Accordion type="multiple" className="w-full">
            {subjects.map((s) => (
              <AccordionItem key={s.id} value={s.id} className="border-b">
                <AccordionTrigger className="text-left">
                  <div className="flex w-full items-center justify-between pr-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.chapters.length} chapters</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1.5">
                    {s.chapters.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => nav({ to: "/revise/$chapterId", params: { chapterId: c.id } })}
                          className="mantis-tile flex w-full items-center justify-between gap-3 p-3 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              Class {c.class_level}
                            </span>
                            <span className="text-sm font-medium">{c.name}</span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>
    </main>
  );
}
