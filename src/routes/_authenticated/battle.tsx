import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Swords, Trophy, Wallet, History, Zap, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/battle")({
  head: () => ({
    meta: [
      { title: "Battle — Last Topper" },
      { name: "description", content: "Compete live: quick quiz, Sunday Mega Test, leaderboards, and wallet." },
      { property: "og:title", content: "Battle Arena — Last Topper" },
      { property: "og:description", content: "Real-time quiz battles with prizes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BattleLayout,
  errorComponent: ({ error, reset }) => (
    <div className="battle-theme flex min-h-screen items-center justify-center p-6 text-sm">
      <div className="battle-glass max-w-md p-6 text-center">
        <p className="battle-title text-lg">Arena offline</p>
        <p className="mt-2 opacity-70">{error.message}</p>
        <button className="battle-btn mt-4" onClick={reset}>Retry</button>
      </div>
    </div>
  ),
  notFoundComponent: () => <div className="battle-theme p-6">Not found</div>,
});

function BattleLayout() {
  const navigate = useNavigate();
  return (
    <div className="battle-theme battle-noselect">
      <header
        className="sticky top-0 z-20 backdrop-blur-lg"
        style={{
          background: "var(--battle-header-bg)",
          borderBottom: "1px solid var(--battle-header-border)",
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate({ to: "/home" })}
            className="rounded-full p-2 opacity-70 hover:opacity-100"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5" style={{ color: "var(--neon-cyan)" }} />
            <span className="battle-title text-base font-bold">Arena</span>
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-rose-400">
              <span className="arena-live-dot" /> LIVE
            </span>
          </div>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 pb-3">
          <TabLink to="/battle" icon={<Zap className="h-3.5 w-3.5" />} label="Quick" exact />
          <TabLink to="/battle/1v1" icon={<Users className="h-3.5 w-3.5" />} label="1v1" />
          <TabLink to="/battle/mega" icon={<Trophy className="h-3.5 w-3.5" />} label="Mega" />
          <TabLink to="/battle/leaderboard" icon={<Trophy className="h-3.5 w-3.5" />} label="Board" />
          <TabLink to="/battle/wallet" icon={<Wallet className="h-3.5 w-3.5" />} label="Wallet" />
          <TabLink to="/battle/history" icon={<History className="h-3.5 w-3.5" />} label="History" />
        </nav>
      </header>
      <main className="arena-live-bg relative mx-auto max-w-4xl px-4 py-6">
        <div className="arena-scanline" />
        <Outlet />
      </main>

    </div>
  );
}

function TabLink({
  to, icon, label, exact,
}: { to: string; icon: React.ReactNode; label: string; exact?: boolean }) {
  return (
    <Link to={to} className="battle-tab inline-flex items-center gap-1.5" activeOptions={{ exact }}>
      {icon}
      {label}
    </Link>
  );
}
