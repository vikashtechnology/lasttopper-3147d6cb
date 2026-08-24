import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { FEATURE_COUNT, FEATURE_GROUPS } from "@/lib/feature-catalog";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CalendarCheck,
  Check,
  Clock3,
  History,
  MessageSquare,
  Repeat2,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Last Topper — JEE & NEET Practice, Battles, and AI Coach" },
      {
        name: "description",
        content:
          "Practice IIT-JEE (PCM) and NEET (PCB) with chapter quizzes, smart review, battles, analytics, community, and an AI study assistant.",
      },
      { property: "og:title", content: "Last Topper — JEE & NEET Practice" },
      {
        property: "og:description",
        content: "Chapter practice, smart review, battles, analytics, and community in one app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const featureIcons: ReactNode[] = [
  <BookOpen className="h-5 w-5" />,
  <ScrollText className="h-5 w-5" />,
  <CalendarCheck className="h-5 w-5" />,
  <Brain className="h-5 w-5" />,
  <Repeat2 className="h-5 w-5" />,
  <BarChart3 className="h-5 w-5" />,
  <Swords className="h-5 w-5" />,
  <Trophy className="h-5 w-5" />,
  <Wallet className="h-5 w-5" />,
  <MessageSquare className="h-5 w-5" />,
  <Users className="h-5 w-5" />,
  <Sparkles className="h-5 w-5" />,
];

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) navigate({ to: "/home", replace: true });
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center bg-background" aria-label="Loading">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <img src="/app-icon-192.png" alt="" className="h-9 w-9 animate-pulse rounded-xl" />
          Opening Last Topper…
        </div>
      </main>
    );
  }

  let iconIndex = 0;

  return (
    <main className="min-h-screen overflow-hidden bg-background/75 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2.5" aria-label="Last Topper home">
            <img
              src="/app-icon-192.png"
              alt=""
              className="h-9 w-9 rounded-xl shadow-sm ring-1 ring-border"
            />
            <span className="font-semibold tracking-tight">Last Topper</span>
          </a>
          <nav className="ml-10 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a className="transition-colors hover:text-foreground" href="#features">
              Features
            </a>
            <a className="transition-colors hover:text-foreground" href="#how-it-works">
              How it works
            </a>
            <a className="transition-colors hover:text-foreground" href="#built-for-focus">
              Why Last Topper
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">
                Start learning <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section id="top" className="relative">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> One focused workspace for JEE and NEET
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.06] tracking-[-0.04em] sm:text-6xl">
              Study smarter. Compete harder. Beat your last self.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Chapter practice, revision, mistake recovery, battles, analytics, and community—kept
              together so every session moves you forward.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-6">
                <Link to="/auth">
                  Continue with Google <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6">
                <a href="#features">Explore all features</a>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <TrustItem>Google-only sign in</TrustItem>
              <TrustItem>PCM and PCB tracks</TrustItem>
              <TrustItem>Works on web and mobile</TrustItem>
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section id="features" className="border-y border-border/60 bg-card/45 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {FEATURE_COUNT} connected capabilities
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need between learning and exam day
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">
              No disconnected tools and no hidden feature maze. Start with a chapter, learn from the
              result, and choose the next best action.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {FEATURE_GROUPS.map((group) => (
              <article key={group.eyebrow} className="mantis-card bg-card/80 p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {group.eyebrow}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{group.title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  {group.description}
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {group.features.map((feature) => {
                    const icon = featureIcons[iconIndex++];
                    return (
                      <div
                        key={feature.title}
                        className="rounded-xl border border-border/70 bg-background/55 p-4"
                      >
                        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {icon}
                        </div>
                        <h4 className="mt-3 text-sm font-semibold">{feature.title}</h4>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {feature.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                A clear daily loop
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">
                Know what to do next—not just what you did last.
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Last Topper connects practice, feedback, and recall so progress does not stop at a
                score screen.
              </p>
            </div>
            <ol className="grid gap-4 sm:grid-cols-2">
              <Step
                number="01"
                title="Choose your track"
                body="Set PCM or PCB once and see the relevant subject catalog."
              />
              <Step
                number="02"
                title="Start focused practice"
                body="Pick chapters, set question count and timer, or enter a daily challenge."
              />
              <Step
                number="03"
                title="Understand the result"
                body="Review accuracy, explanations, time, mistakes, XP, and mastery signals."
              />
              <Step
                number="04"
                title="Return at the right time"
                body="Use your mistake bank and spaced-review queue, or test yourself in battle."
              />
            </ol>
          </div>
        </div>
      </section>

      <section id="built-for-focus" className="px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-primary/20 bg-primary text-primary-foreground shadow-2xl shadow-primary/15">
          <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-primary-foreground/75">
                <ShieldCheck className="h-4 w-4" /> Built for a focused study routine
              </div>
              <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight">
                Your practice, progress, competition, and community in one account.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/70">
                Sign in with Google, complete a short onboarding, and continue from any supported
                device without sharing a phone number.
              </p>
            </div>
            <Button asChild size="lg" variant="secondary" className="h-12 px-6">
              <Link to="/auth">
                Get started <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/70 bg-background/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <img src="/app-icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
            <span>© {new Date().getFullYear()} Last Topper</span>
          </div>
          <nav className="flex flex-wrap gap-4 sm:ml-auto">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/refund" className="hover:text-foreground">
              Refund policy
            </Link>
            <Link to="/auth" className="font-medium text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-8 -z-10 rounded-full bg-primary/12 blur-3xl" />
      <div className="mantis-card overflow-hidden bg-card/90 shadow-2xl shadow-primary/10">
        <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4">
          <img src="/app-icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <div>
            <p className="text-xs font-semibold">Your study dashboard</p>
            <p className="text-[11px] text-muted-foreground">One clear view of today's progress</p>
          </div>
          <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            Ready
          </span>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-3 gap-3">
            <PreviewMetric icon={<Zap className="h-4 w-4" />} label="XP" value="880" />
            <PreviewMetric icon={<Clock3 className="h-4 w-4" />} label="Streak" value="12 days" />
            <PreviewMetric icon={<Trophy className="h-4 w-4" />} label="Accuracy" value="84%" />
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Recommended next</p>
                <p className="mt-0.5 text-sm font-semibold">Review 6 due questions</p>
              </div>
              <Repeat2 className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[68%] rounded-full bg-primary" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewAction
              icon={<BookOpen className="h-4 w-4" />}
              title="Chapter practice"
              caption="Physics · Class 12"
            />
            <PreviewAction
              icon={<Swords className="h-4 w-4" />}
              title="Quick battle"
              caption="10 questions · live rank"
            />
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Every result feeds your history, mistakes, and
            mastery.
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/55 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold sm:text-base">{value}</div>
    </div>
  );
}

function PreviewAction({
  icon,
  title,
  caption,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/55 p-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">{title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{caption}</p>
      </div>
    </div>
  );
}

function TrustItem({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Check className="h-3.5 w-3.5 text-emerald-500" />
      {children}
    </span>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <li className="mantis-card bg-card/75 p-5">
      <span className="text-xs font-bold tracking-widest text-primary">{number}</span>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </li>
  );
}
