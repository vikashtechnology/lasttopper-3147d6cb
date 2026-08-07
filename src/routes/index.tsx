import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GraduationCap, Brain, Trophy } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arena — Professional BGMI & Free Fire Tournaments" },
      {
        name: "description",
        content:
          "Compete in high-stakes esports tournaments. Daily matches for BGMI and Free Fire with automated scoring and instant payouts.",
      },
      { property: "og:title", content: "Arena Esports Tournaments" },
      {
        property: "og:description",
        content: "Join professional BGMI and Free Fire tournaments with daily prize pools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        navigate({ to: "/home", replace: true });
      } else {
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex max-w-2xl flex-col items-center px-6 pt-16 pb-12 text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]">
          <Trophy className="h-8 w-8" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl uppercase italic">The Arena Awaits.</h1>
        <p className="mt-4 max-w-md text-base text-muted-foreground uppercase tracking-widest text-xs font-semibold">
          Professional BGMI & Free Fire Tournaments
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <Button asChild size="lg" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
            <Link to="/auth">Enter Arena</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-3xl grid-cols-1 gap-4 px-6 pb-24 sm:grid-cols-3">
        <FeatureCard
          icon={<Trophy className="h-5 w-5" />}
          title="Daily Tournaments"
          body="Compete in daily BGMI and Free Fire matches for huge prize pools."
        />
        <FeatureCard
          icon={<Brain className="h-5 w-5" />}
          title="Real-time Stats"
          body="Track your K/D ratio, winnings, and placement points in real-time."
        />
        <FeatureCard
          icon={<GraduationCap className="h-5 w-5" />}
          title="Instant Payouts"
          body="Automated winnings distribution directly to your UPI/Bank account."
        />
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
