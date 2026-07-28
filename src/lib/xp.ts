/** Shared XP / rank badge logic (safe for both client and server). */

export type XpTier = {
  key: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  name: string;
  icon: string;
  min: number;
  max: number | null;
  /** XP earned per correct answer is BASE_XP_PER_QUESTION * multiplier. */
  multiplier: number;
  /** Tailwind classes for the badge chip. */
  className: string;
};

export const BASE_XP_PER_QUESTION = 10;

export const XP_TIERS: XpTier[] = [
  {
    key: "bronze",
    name: "Bronze",
    icon: "🥉",
    min: 0,
    max: 100,
    multiplier: 1,
    className: "bg-amber-700/15 text-amber-700 dark:text-amber-500",
  },
  {
    key: "silver",
    name: "Silver",
    icon: "🥈",
    min: 100,
    max: 1000,
    multiplier: 2,
    className: "bg-slate-400/20 text-slate-600 dark:text-slate-300",
  },
  {
    key: "gold",
    name: "Gold",
    icon: "🥇",
    min: 1000,
    max: 10000,
    multiplier: 4,
    className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  },
  {
    key: "platinum",
    name: "Platinum",
    icon: "💠",
    min: 10000,
    max: 100000,
    multiplier: 8,
    className: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  },
  {
    key: "diamond",
    name: "Diamond",
    icon: "💎",
    min: 100000,
    max: null,
    multiplier: 16,
    className: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  },
];

export function tierForXp(xp: number): XpTier {
  const value = Math.max(0, Number(xp) || 0);
  for (let i = XP_TIERS.length - 1; i >= 0; i -= 1) {
    if (value >= XP_TIERS[i].min) return XP_TIERS[i];
  }
  return XP_TIERS[0];
}

export function xpPerQuestion(xp: number, boost = 1): number {
  return BASE_XP_PER_QUESTION * tierForXp(xp).multiplier * boost;
}

/**
 * XP gained for N correct answers, applying the multiplier of each tier crossed.
 * `boost` is the Pro multiplier (2× for Pro members).
 */
export function xpForCorrect(currentXp: number, correctCount: number, boost = 1): number {
  let xp = Math.max(0, Number(currentXp) || 0);
  let gained = 0;
  for (let i = 0; i < Math.max(0, correctCount); i += 1) {
    const step = xpPerQuestion(xp, boost);
    gained += step;
    xp += step;
  }
  return gained;
}

export function tierProgress(xp: number) {
  const tier = tierForXp(xp);
  const next = XP_TIERS[XP_TIERS.indexOf(tier) + 1] ?? null;
  const span = next ? next.min - tier.min : 0;
  const percent = next ? Math.min(100, Math.round(((xp - tier.min) / span) * 100)) : 100;
  return { tier, next, percent, toNext: next ? Math.max(0, next.min - xp) : 0 };
}
