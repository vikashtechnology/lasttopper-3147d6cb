import { tierProgress } from "@/lib/xp";

export function RankBadge({
  xp,
  showProgress = false,
  className = "",
}: {
  xp: number;
  showProgress?: boolean;
  className?: string;
}) {
  const { tier, next, percent, toNext } = tierProgress(xp);
  return (
    <div className={className}>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${tier.className}`}
        title={`${tier.name} rank · ${tier.multiplier}× XP per question`}
      >
        <span aria-hidden>{tier.icon}</span>
        {tier.name}
        <span className="opacity-70">{tier.multiplier}×</span>
      </span>
      {showProgress ? (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {next ? `${toNext} XP to ${next.name} (${next.multiplier}× XP)` : "Max rank reached"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
