import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { getMyProfile } from "@/lib/user.functions";
import { tierProgress } from "@/lib/xp";

/**
 * Live XP bar showing progress from the current rank to the next one.
 * Reads the shared ["my-profile"] cache so it updates as XP is awarded.
 */
export function XpProgress({
  gained,
  className = "",
}: {
  gained?: number;
  className?: string;
}) {
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getMyProfile() });
  const xp = Number((profile.data as { reputation?: number } | undefined)?.reputation ?? 0);
  const { tier, next, percent, toNext } = tierProgress(xp);

  return (
    <div className={`rounded-2xl border border-border bg-card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${tier.className}`}
        >
          <span aria-hidden>{tier.icon}</span>
          {tier.name}
          <span className="opacity-70">{tier.multiplier}×</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          <Zap className="h-3.5 w-3.5" />
          {xp} XP
          {gained ? <span className="ml-1 text-emerald-600 dark:text-emerald-400">+{gained}</span> : null}
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-700"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
        {next
          ? `${toNext} XP to ${next.name} ${next.icon} — unlocks ${next.multiplier}× XP per correct answer`
          : "Max rank reached — 16× XP per correct answer"}
      </div>
    </div>
  );
}
