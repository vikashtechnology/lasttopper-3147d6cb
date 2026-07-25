import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getSubjectsWithChapters,
  generateQuestions,
  createQuizSession,
  getTodayUsage,
} from "@/lib/learning.functions";
import { getMyProfile } from "@/lib/user.functions";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronLeft, Sparkles, Loader2, Lock } from "lucide-react";

const subjectsQuery = {
  queryKey: ["subjects-with-chapters"] as const,
  queryFn: () => getSubjectsWithChapters(),
};

const profileQuery = {
  queryKey: ["my-profile"] as const,
  queryFn: () => getMyProfile(),
};

export const Route = createFileRoute("/_authenticated/learning")({
  head: () => ({
    meta: [
      { title: "Learning — Last Topper" },
      { name: "description", content: "Pick chapters and generate an AI practice quiz." },
      { property: "og:title", content: "Learning — Last Topper" },
      { property: "og:description", content: "Adaptive AI-generated practice sets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(subjectsQuery),
      context.queryClient.ensureQueryData(profileQuery),
    ]),
  component: LearningPage,
});

function LearningPage() {
  const nav = useNavigate();
  const { data: subjects } = useSuspenseQuery(subjectsQuery);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const isPro = !!profile?.is_pro;
  const dailyLimit = profile?.daily_question_limit ?? 20;
  const usage = useQuery({ queryKey: ["today-usage"], queryFn: () => getTodayUsage(), refetchOnWindowFocus: true });
  const usedToday = usage.data?.used ?? 0;
  const remaining = Math.max(0, dailyLimit - usedToday);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<20 | 50 | 100>(20);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(45);
  const [busy, setBusy] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [proReason, setProReason] = useState<string | undefined>(undefined);

  // Auto-trigger upgrade popup when user has hit their daily free limit.
  useEffect(() => {
    if (!isPro && !usage.isLoading && remaining === 0 && usedToday > 0) {
      setProReason(`You've used all ${dailyLimit} free questions for today. Upgrade to keep practicing.`);
      setProOpen(true);
    }
  }, [isPro, usage.isLoading, remaining, usedToday, dailyLimit]);

  const chapterIds = useMemo(() => Array.from(selected), [selected]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }




  async function handleStart() {
    if (chapterIds.length === 0) {
      toast.error("Pick at least 1 chapter");
      return;
    }
    if (count > 20 && !isPro) {
      setProReason("50 & 100 question sets are a Pro feature.");
      setProOpen(true);
      return;
    }
    if (!isPro && count > remaining) {
      setProReason(
        remaining === 0
          ? `You've used all ${dailyLimit} free questions for today. Upgrade to keep practicing.`
          : `Only ${remaining} of ${dailyLimit} free questions left today. Upgrade for more.`,
      );
      setProOpen(true);
      return;
    }
    setBusy(true);
    try {
      const gen = await generateQuestions({
        data: { chapter_ids: chapterIds, question_count: count },
      });
      if ("error" in gen && gen.error) {
        toast.error(gen.error);
        return;
      }
      if (!gen.questions || gen.questions.length === 0) {
        toast.error("No questions generated. Try again.");
        return;
      }
      const session = await createQuizSession({
        data: {
          chapter_ids: chapterIds,
          question_count: gen.questions.length,
          questions: gen.questions,
          timer_enabled: timerEnabled,
          duration_seconds: timerEnabled ? timerMinutes * 60 : null,
        },
      });
      nav({ to: "/quiz/$sessionId", params: { sessionId: session.id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start quiz";
      if (msg.includes("PRO_REQUIRED")) {
        toast.error("50 & 100 question sets are a Pro feature.", {
          action: { label: "Upgrade", onClick: () => nav({ to: "/pricing" }) },
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  if (busy) return <GeneratingScreen count={count} chapters={chapterIds.length} />;

  return (
    <main className="min-h-screen bg-background">

      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/home" })} aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="text-base font-semibold">Learning</div>
            <div className="text-xs text-muted-foreground">Pick chapters and start a quiz</div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 pt-4">
        {subjects.length === 0 ? (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            Complete onboarding to see chapters.
          </div>
        ) : (
          <Accordion type="multiple" className="w-full">
            {subjects.map((s) => {
              const selectedIn = s.chapters.filter((c) => selected.has(c.id)).length;
              return (
                <AccordionItem key={s.id} value={s.id} className="border-b">
                  <AccordionTrigger className="text-left">
                    <div className="flex w-full items-center justify-between pr-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {selectedIn > 0 ? `${selectedIn} selected` : `${s.chapters.length} chapters`}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2 pl-1">
                      {s.chapters.map((c) => (
                        <li key={c.id} className="flex items-center gap-3">
                          <Checkbox
                            id={`c-${c.id}`}
                            checked={selected.has(c.id)}
                            onCheckedChange={() => toggle(c.id)}
                          />
                          <Label htmlFor={`c-${c.id}`} className="flex-1 cursor-pointer text-sm font-normal">
                            <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              Class {c.class_level}
                            </span>
                            {c.name}
                          </Label>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </section>

      <section className="mx-auto max-w-3xl px-5 py-6">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Question count</div>
            {!isPro && (
              <Link to="/pricing" className="text-[11px] font-medium text-primary hover:underline">
                Unlock 50 & 100 with Pro
              </Link>
            )}
          </div>
          <RadioGroup
            value={String(count)}
            onValueChange={(v) => {
              const n = Number(v) as 20 | 50 | 100;
              if (n > 20 && !isPro) {
                setProReason("50 & 100 question sets are a Pro feature.");
                setProOpen(true);
                return;
              }
              setCount(n);
            }}
            className="mt-3 grid grid-cols-3 gap-3"
          >
            {[20, 50, 100].map((n) => {
              const locked = n > 20 && !isPro;
              return (
                <label
                  key={n}
                  htmlFor={`n-${n}`}
                  className={`flex items-center gap-2 rounded-lg border p-3 ${
                    locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent"
                  }`}
                >
                  <RadioGroupItem id={`n-${n}`} value={String(n)} disabled={locked} />
                  <span className="text-sm">{n}</span>
                  {locked && <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                </label>
              );
            })}
          </RadioGroup>


          <div className="mt-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Timer mode</div>
              <div className="text-xs text-muted-foreground">Auto-submit when time runs out</div>
            </div>
            <Switch checked={timerEnabled} onCheckedChange={setTimerEnabled} />
          </div>
          {timerEnabled && (
            <div className="mt-3 flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={240}
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(Math.max(1, Number(e.target.value) || 1))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          )}


        </div>

        <Button className="mt-5 h-12 w-full text-base" onClick={handleStart} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Start quiz
            </>
          )}
        </Button>
      </section>
    </main>
  );
}

function GeneratingScreen({ count, chapters }: { count: number; chapters: number }) {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-background via-background to-muted/40 px-6">
      <div className="mantis-card w-full max-w-sm p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-8 w-8 animate-pulse" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">Generating your quiz…</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Crafting {count} NCERT-aligned questions across {chapters} chapter{chapters === 1 ? "" : "s"}.
        </p>
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Usually takes 5–15 seconds
        </div>
      </div>
    </main>
  );
}

