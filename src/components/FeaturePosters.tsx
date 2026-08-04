import { Link } from "@tanstack/react-router";
import { Swords, Sparkles, BookMarked, Wallet, Users, Trophy } from "lucide-react";

type Poster = {
  to: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  tint: string;
};

const POSTERS: Poster[] = [
  {
    to: "/battle",
    eyebrow: "Battle arena",
    title: "1v1 live battles",
    body: "Challenge a rival, answer fast, climb the leaderboard.",
    icon: <Swords className="h-5 w-5" />,
    tint: "from-indigo-500/15 to-fuchsia-500/10",
  },
  {
    to: "/battle/mega",
    eyebrow: "Every Sunday",
    title: "Mega Test prize pool",
    body: "Join the weekly contest and win Topper Coins.",
    icon: <Trophy className="h-5 w-5" />,
    tint: "from-amber-500/15 to-orange-500/10",
  },
  {
    to: "/revise",
    eyebrow: "Revise",
    title: "NCERT notes + diagrams",
    body: "Crisp topic notes with formulas and visual diagrams.",
    icon: <BookMarked className="h-5 w-5" />,
    tint: "from-emerald-500/15 to-teal-500/10",
  },
  {
    to: "/pricing",
    eyebrow: "Go Pro",
    title: "Unlimited AI tutor",
    body: "2× XP, step-by-step solutions and unlimited questions.",
    icon: <Sparkles className="h-5 w-5" />,
    tint: "from-violet-500/15 to-sky-500/10",
  },
  {
    to: "/battle/wallet",
    eyebrow: "Wallet",
    title: "Earn & withdraw TC",
    body: "Refer friends, win contests, cash out your coins.",
    icon: <Wallet className="h-5 w-5" />,
    tint: "from-cyan-500/15 to-blue-500/10",
  },
  {
    to: "/community",
    eyebrow: "Community",
    title: "Doubts & study groups",
    body: "Ask doubts, join groups, learn with other toppers.",
    icon: <Users className="h-5 w-5" />,
    tint: "from-rose-500/15 to-pink-500/10",
  },
];

/** Horizontal scroller of feature posters shown on the dashboard. */
export function FeaturePosters() {
  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {POSTERS.map((p) => (
        <Link
          key={p.to + p.title}
          to={p.to}
          className={`mantis-card relative min-w-[260px] max-w-[280px] snap-start overflow-hidden bg-gradient-to-br p-5 transition-transform hover:-translate-y-0.5 ${p.tint}`}
        >
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-background/70 text-primary ring-1 ring-border">
            {p.icon}
          </div>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {p.eyebrow}
          </div>
          <div className="mt-0.5 text-base font-semibold leading-tight">{p.title}</div>
          <p className="mt-1 text-xs text-muted-foreground">{p.body}</p>
        </Link>
      ))}
    </div>
  );
}
