import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getQuickLeaderboard } from "@/lib/battle.functions";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/battle/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Last Topper" },
      { name: "description", content: "Live quick-battle top players (last 24h)." },
      { property: "og:title", content: "Battle Leaderboard" },
      { property: "og:description", content: "Live top 10 quick-battle players." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Board,
});

function Board() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["quick-leaderboard"], queryFn: () => getQuickLeaderboard(), refetchInterval: 15000 });
  useEffect(() => {
    const ch = supabase
      .channel("board-battles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "battle_sessions" },
        () => qc.invalidateQueries({ queryKey: ["quick-leaderboard"] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);

  const items = q.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-yellow-300" />
        <h1 className="battle-title text-xl">Live Top Players · 24h</h1>
      </div>
      <div className="battle-glass p-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plays yet — be first.</p>
        ) : (
          <ol className="space-y-1.5">
            {items.map((r) => (
              <li
                key={r.key}
                className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                  r.is_me ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  r.rank === 1 ? "bg-yellow-400 text-black" : r.rank === 2 ? "bg-slate-300 text-black" : r.rank === 3 ? "bg-orange-400 text-black" : "bg-white/10 text-white"
                }`}>{r.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {r.user.full_name ?? r.user.email ?? "Player"}
                    {r.is_me && <span className="ml-1 text-xs text-primary">(you)</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{r.correct_count} correct · {r.time_taken_seconds}s</span>
                    {r.is_demo ? <RankBadge xp={r.xp ?? 0} /> : null}
                  </div>
                </div>
                <div className="text-lg font-bold text-primary">{r.score}</div>

              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
