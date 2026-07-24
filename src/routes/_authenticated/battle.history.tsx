import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getBattleHistory } from "@/lib/battle.functions";
import { History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/battle/history")({
  head: () => ({
    meta: [
      { title: "Battle History — Last Topper" },
      { name: "description", content: "All your quick battles and mega tests." },
      { property: "og:title", content: "Battle History" },
      { property: "og:description", content: "Your past battles at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const q = useQuery({ queryKey: ["battle-history"], queryFn: () => getBattleHistory() });
  const items = q.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-cyan-300" />
        <h1 className="battle-title text-xl">Your battles</h1>
      </div>
      <div className="battle-glass p-4">
        {items.length === 0 ? (
          <p className="text-sm text-white/50">No battles yet. Go crush the leaderboard.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div>
                  <div className="text-sm font-semibold uppercase">
                    {r.mode === "mega" ? "Mega Test" : "Quick"} · {new Date(r.submitted_at!).toLocaleString()}
                  </div>
                  <div className="text-xs text-white/50">
                    {r.correct_count} correct · {r.time_taken_seconds ?? 0}s
                  </div>
                </div>
                <div className="text-lg font-bold text-cyan-300">{r.score}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
