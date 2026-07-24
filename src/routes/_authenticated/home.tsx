import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyProfile, pingActivity } from "@/lib/user.functions";
import { finalizeStaleSessions } from "@/lib/learning.functions";
import { notifyFirstLogin, unreadNotificationsCount } from "@/lib/community.functions";
import { amIAdmin } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { useUserStore, type UserProfile } from "@/store/user";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import {
  BookOpen,
  Swords,
  Users,
  User as UserIcon,
  Flame,
  Target,
  LogOut,
  History,
  BarChart3,
  AlertOctagon,
  Bell,
  ShieldCheck,
} from "lucide-react";

const profileQuery = {
  queryKey: ["my-profile"] as const,
  queryFn: () => getMyProfile(),
};

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home — Last Topper" },
      { name: "description", content: "Your daily practice, streak, and accuracy at a glance." },
      { property: "og:title", content: "Home — Last Topper" },
      { property: "og:description", content: "Your daily practice hub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  component: Home,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm">
      <p className="text-destructive">Failed to load: {error.message}</p>
      <Button className="mt-3" onClick={reset}>
        Retry
      </Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
});

function Home() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(profileQuery);
  const setProfile = useUserStore((s) => s.setProfile);
  const clear = useUserStore((s) => s.clear);
  const profile = useUserStore((s) => s.profile);

  useEffect(() => {
    if (data) setProfile(data as UserProfile);
  }, [data, setProfile]);

  // On app open: update streak and finalize any abandoned sessions
  useQuery({
    queryKey: ["ping-activity"],
    queryFn: async () => {
      const [ping] = await Promise.all([
        pingActivity(),
        finalizeStaleSessions().catch(() => ({ finalized: [] as string[] })),
        notifyFirstLogin().catch(() => ({ ok: true })),
      ]);
      await qc.invalidateQueries({ queryKey: ["my-profile"] });
      return ping;
    },
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const unread = useQuery({ queryKey: ["notif-unread"], queryFn: () => unreadNotificationsCount(), refetchInterval: 30000 });
  const admin = useQuery({ queryKey: ["am-i-admin"], queryFn: () => amIAdmin() });

  const p: UserProfile | null = (profile ?? (data as UserProfile | null)) as UserProfile | null;

  const usedToday = 0;
  const limit = p?.daily_question_limit ?? 20;
  const percent = Math.round((usedToday / limit) * 100);
  const needsOnboarding = !!p && (!p.phone || !p.profession || !p.onboarded);

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div>
            <div className="text-xs text-muted-foreground">Welcome back</div>
            <div className="text-base font-semibold">
              {p?.full_name ?? p?.email ?? "Learner"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {admin.data?.admin && (
              <Link to="/admin" className="rounded-full p-2 text-muted-foreground hover:text-foreground" aria-label="Admin">
                <ShieldCheck className="h-4 w-4" />
              </Link>
            )}
            <Link to="/notifications" className="relative rounded-full p-2 text-muted-foreground hover:text-foreground" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unread.data && unread.data.count > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unread.data.count}
                </span>
              ) : null}
            </Link>
            <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 pt-6">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Today's questions</div>
              <div className="mt-1 text-3xl font-bold">
                {usedToday}
                <span className="text-base font-medium text-muted-foreground"> / {limit}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Plan</div>
              <div className="mt-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Free
              </div>
            </div>
          </div>
          <Progress value={percent} className="mt-4 h-2" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <StatCard
            icon={<Flame className="h-4 w-4" />}
            label="Streak"
            value={`${p?.streak ?? 0} days`}
          />
          <StatCard
            icon={<Target className="h-4 w-4" />}
            label="Accuracy"
            value={`${Math.round(Number(p?.total_accuracy ?? 0))}%`}
          />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Practice</h2>
        <div className="grid grid-cols-2 gap-4">
          <NavTile
            icon={<BookOpen className="h-5 w-5" />}
            title="Learning"
            body="Practice by chapter"
            onClick={() => navigate({ to: "/learning" })}
          />
          <NavTile
            icon={<AlertOctagon className="h-5 w-5" />}
            title="Mistake bank"
            body="Fix what you got wrong"
            onClick={() => navigate({ to: "/mistakes" })}
          />
          <NavTile
            icon={<BarChart3 className="h-5 w-5" />}
            title="Mastery"
            body="Analytics & charts"
            onClick={() => navigate({ to: "/analytics" })}
          />
          <NavTile
            icon={<History className="h-5 w-5" />}
            title="History"
            body="Past attempts"
            onClick={() => navigate({ to: "/history" })}
          />
          <NavTile
            icon={<Swords className="h-5 w-5" />}
            title="Battle"
            body="Live quiz + prizes"
            onClick={() => navigate({ to: "/battle" })}
          />
          <NavTile icon={<Users className="h-5 w-5" />} title="Community" body="Coming soon" />
          <NavTile icon={<UserIcon className="h-5 w-5" />} title="Profile" body="Your stats" />
        </div>
      </section>

      <OnboardingFlow open={needsOnboarding} />
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function NavTile({
  icon,
  title,
  body,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </button>
  );
}
