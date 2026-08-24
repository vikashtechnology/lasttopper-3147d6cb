export type ProductFeature = {
  title: string;
  description: string;
};

export type FeatureGroup = {
  title: string;
  eyebrow: string;
  description: string;
  features: readonly ProductFeature[];
};

/**
 * Canonical user-facing feature copy. Keep public marketing, onboarding, and
 * product summaries aligned by updating this catalog instead of duplicating
 * feature descriptions across pages.
 */
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    eyebrow: "Learn",
    title: "Practice that adapts to your syllabus",
    description: "Build focused JEE or NEET practice around the chapters you are studying now.",
    features: [
      {
        title: "Chapter practice",
        description: "Create 20, 50, or 100-question NCERT-aligned sets with an optional timer.",
      },
      {
        title: "Previous-year questions",
        description: "Practise available JEE and NEET PYQs by exam and year.",
      },
      {
        title: "Daily challenge",
        description: "Complete one fresh 10-question challenge and earn Topper Coins.",
      },
      {
        title: "Revision notes and flashcards",
        description:
          "Turn NCERT chapters into focused topic notes, diagrams, and quick-recall cards.",
      },
    ],
  },
  {
    eyebrow: "Improve",
    title: "Turn every attempt into progress",
    description: "See what went wrong, revisit it at the right time, and measure improvement.",
    features: [
      {
        title: "Mistake bank",
        description: "Keep incorrect answers in one place for focused correction.",
      },
      {
        title: "Smart review",
        description: "Use spaced repetition to bring weak questions back when they are due.",
      },
      {
        title: "Analytics and history",
        description: "Track accuracy, attempts, time, chapter mastery, streaks, ranks, and XP.",
      },
    ],
  },
  {
    eyebrow: "Compete",
    title: "Make practice feel like a challenge",
    description: "Test speed and accuracy in quick battles, live rooms, and scheduled mega tests.",
    features: [
      {
        title: "Battle arena",
        description: "Play quick and 1v1 quiz battles, then compare scores on the leaderboard.",
      },
      {
        title: "Sunday Mega Test",
        description: "Join scheduled full-length tests with wallet entry and Topper Coin prizes.",
      },
      {
        title: "Wallet and rewards",
        description: "Review Topper Coin activity, referrals, vouchers, and eligible withdrawals.",
      },
    ],
  },
  {
    eyebrow: "Connect",
    title: "Learn with people, not in isolation",
    description: "Ask for help, discuss concepts, and study with a focused student community.",
    features: [
      {
        title: "Forums and doubts",
        description: "Post discussions, ask questions, reply, vote, and accept helpful answers.",
      },
      {
        title: "Study groups",
        description: "Create or join groups and keep the conversation in one shared space.",
      },
      {
        title: "Profiles, feed and notifications",
        description:
          "Follow learners, share activity, and keep up with study and community updates.",
      },
      {
        title: "AI study assistant",
        description: "Ask concept questions, keep chat threads, and get contextual study support.",
      },
    ],
  },
] as const;

export const FEATURE_COUNT = FEATURE_GROUPS.reduce(
  (total, group) => total + group.features.length,
  0,
);
