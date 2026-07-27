import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trophy, Users, Clock, Coins } from "lucide-react";
import { TopperCoin } from "@/components/TopperCoin";
import { getUpcomingMegaTest, joinMegaTest, startMegaSession } from "@/lib/battle.functions";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/_authenticated/battle/mega")({
  head: () => ({
    meta: [
      { title: "Sunday Mega Test — Last Topper" },
      { name: "description", content: "180 questions, 3 hours, real prizes every Sunday 10AM IST." },
      { property: "og:title", content: "Sunday Mega Test" },
      { property: "og:description", content: "180q · 3hr · prizes up to 🪙100 Topper Coins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MegaTest,
});

function MegaTest() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["mega-test"],
    queryFn: () => getUpcomingMegaTest(),
    refetchInterval: 30000,
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel("mega-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "mega_test_entries" },
        () => qc.invalidateQueries({ queryKey: ["mega-test"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "mega_tests" },
        () => qc.invalidateQueries({ queryKey: ["mega-test"] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);


  const join = useMutation({
    mutationFn: (id: string) => joinMegaTest({ data: { mega_test_id: id } }),
    onSuccess: () => {
      toast.success("You're in!");
      qc.invalidateQueries({ queryKey: ["mega-test"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const start = useMutation({
    mutationFn: (id: string) => startMegaSession({ data: { mega_test_id: id } }),
    onSuccess: (res) =>
      navigate({ to: "/battle/play/$sessionId", params: { sessionId: res.id } }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="text-white/60 text-sm">Loading…</div>;
  const info = q.data;
  if (!info) return <div className="battle-glass p-5 text-sm">Complete onboarding first.</div>;

  const { test, entry, participants } = info;
  const startMs = new Date(test.scheduled_start).getTime();
  const endMs = new Date(test.scheduled_end).getTime();
  const isLive = now >= startMs && now < endMs;
  const isDone = now >= endMs;
  const untilStartMs = Math.max(0, startMs - now);
  const untilEndMs = Math.max(0, endMs - now);

  return (
    <div className="space-y-4">
      <div className="battle-glass battle-slide-up p-6">
        <div className="flex items-center gap-2 text-yellow-300">
          <Trophy className="h-5 w-5" />
          <span className="text-xs uppercase tracking-widest">Sunday Mega Test</span>
        </div>
        <h1 className="battle-title mt-2 text-2xl">
          Prove your skill.
        </h1>
        <p className="mt-2 inline-flex flex-wrap items-center gap-1 text-sm text-white/70">
          180 questions · 3-hour window · entry <TopperCoin size={14} />{Number(test.entry_fee)} TC
        </p>



        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Stat icon={<Users className="h-4 w-4" />} label="Players" value={String(participants)} />
          <Stat
            icon={<Clock className="h-4 w-4" />}
            label={isDone ? "Ended" : isLive ? "Ends in" : "Starts in"}
            value={isDone ? "—" : fmtDur(isLive ? untilEndMs : untilStartMs)}
          />
        </div>

        <div className="mt-2 text-xs text-white/50">
          If fewer than {test.min_participants} players join, entry fee is auto-refunded.
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {!entry?.paid && !isDone && !isLive && (
            <button
              className="battle-btn inline-flex items-center gap-2"
              disabled={join.isPending}
              onClick={() => join.mutate(test.id)}
            >
              <Coins className="h-4 w-4" />
              {join.isPending ? "Joining…" : (
                <span className="inline-flex items-center gap-1">Join for <TopperCoin size={14} />{Number(test.entry_fee)} TC</span>
              )}
            </button>
          )}
          {!entry?.paid && isLive && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-400/10 px-3 py-2 text-sm font-semibold uppercase tracking-widest text-emerald-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Test is live
            </div>
          )}

          {entry?.paid && !entry.session_id && isLive && (
            <button className="battle-btn" disabled={start.isPending} onClick={() => start.mutate(test.id)}>
              {start.isPending ? "Preparing…" : "Enter test"}
            </button>
          )}
          {entry?.paid && entry.session_id && isLive && (
            <button
              className="battle-btn"
              onClick={() => navigate({ to: "/battle/play/$sessionId", params: { sessionId: entry.session_id! } })}
            >Resume test</button>
          )}
          {entry?.paid && !isLive && !isDone && (
            <div className="rounded-xl border border-cyan-400/50 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-200">
              You're registered. Come back when the timer hits zero.
            </div>
          )}
          {entry?.refunded && (
            <div className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              Refunded — didn't reach min participants.
            </div>
          )}
          {isDone && entry?.rank && (
            <div className="inline-flex items-center gap-1 rounded-xl border border-yellow-400/60 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-100">
              Rank #{entry.rank} · Prize <TopperCoin size={14} />{Number(entry.prize ?? 0)} TC

            </div>
          )}
        </div>
      </div>

      <div className="battle-glass p-5">
        <div className="mb-2 text-xs uppercase tracking-widest text-white/60">Prize pool (Topper Coins · 1 TC = ₹1)</div>
        <ul className="space-y-1 text-sm">
          <li className="inline-flex items-center gap-1">🥇 Rank 1 — <TopperCoin size={14} />100 TC <span className="ml-1 rounded-full bg-fuchsia-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-fuchsia-200">+ Weekly Pro (50+ players)</span></li>
          <li className="inline-flex items-center gap-1">🥈 Rank 2 — <TopperCoin size={14} />50 TC</li>
          <li className="inline-flex items-center gap-1">🥉 Rank 3 — <TopperCoin size={14} />25 TC</li>
          <li className="inline-flex items-center gap-1">Ranks 4–10 — <TopperCoin size={14} />15 TC each</li>
        </ul>
      </div>

    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-xs text-white/60">{icon}{label}</div>
      <div className="mt-1 text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
