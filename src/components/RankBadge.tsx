import { tierProgress } from "@/lib/xp";

export function RankBadge({
  xp,
  isPro = false,
  showProgress = false,
  className = "",
}: {
  xp: number;
  isPro?: boolean;
  showProgress?: boolean;
  className?: string;
}) {
  const { tier, next, percent, toNext } = tierProgress(xp);
  return (
    <div className={className}>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${tier.className} ${
          isPro ? "ring-2 ring-amber-400/70 ring-offset-1 ring-offset-background" : ""
        }`}
        title={`${tier.name} rank · ${tier.multiplier * (isPro ? 2 : 1)}× XP per question${isPro ? " (Pro 2× boost)" : ""}`}
      >
        <span aria-hidden>{tier.icon}</span>
        {tier.name}
        <span className="opacity-70">{tier.multiplier * (isPro ? 2 : 1)}×</span>
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
