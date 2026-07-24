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
import { AppShell, defaultNavGroups } from "@/components/shell/AppShell";
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
  Trophy,
} from "lucide-react";

const profileQuery = {
  queryKey: ["my-profile"],
  queryFn: () => getMyProfile(),
} as const;

export const Route = createFileRoute("/_authenticated/home")({
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-red-600">Something went wrong: {String(error)}</div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(profileQuery);
  const setProfile = useUserStore((s) => s.setProfile);
  const clear = useUserStore((s) => s.clear);
  const profile = useUserStore((s) => s.profile);

  useEffect(() => {
    if (data) setProfile(data as UserProfile);
  }, [data, setProfile]);

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

  const groups = defaultNavGroups({ profileUserId: p?.id, admin: admin.data?.admin });

  return (
    <AppShell
      header={`Welcome back, ${p?.full_name?.split(" ")[0] ?? p?.email?.split("@")[0] ?? "Learner"}`}
      groups={groups}
      footerNote={<>© {new Date().getFullYear()} Last Topper — Learn. Compete. Earn.</>}
      headerActions={
        <>
          {admin.data?.admin && (
            <Link to="/admin" className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Admin">
              <ShieldCheck className="h-4 w-4" />
            </Link>
          )}
          <Link to="/notifications" className="relative rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Notifications">
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
        </>
      }
    >
      {/* Top row: quota + stats */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="mantis-card p-5 md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Today's questions</div>
              <div className="mt-1 text-3xl font-bold">
                {usedToday}
                <span className="text-base font-medium text-muted-foreground"> / {limit}</span>
              </div>
            </div>
            <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Free plan
            </div>
          </div>
          <Progress value={percent} className="mt-4 h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            NCERT-only questions generated by AI — sharp, exam-aligned practice every day.
          </p>
        </div>
        <StatCard icon={<Flame className="h-4 w-4" />} label="Streak" value={`${p?.streak ?? 0} days`} />
        <StatCard icon={<Target className="h-4 w-4" />} label="Accuracy" value={`${Math.round(Number(p?.total_accuracy ?? 0))}%`} />
        <StatCard icon={<Trophy className="h-4 w-4" />} label="Profession" value={(p?.profession ?? "—").toUpperCase()} />
      </section>

      {/* Practice */}
      <SectionHeading title="Practice" hint="Pick a mode to start" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NavTile icon={<BookOpen className="h-5 w-5" />} title="Learning" body="Practice by chapter" onClick={() => navigate({ to: "/learning" })} />
        <NavTile icon={<AlertOctagon className="h-5 w-5" />} title="Mistake bank" body="Fix your errors" onClick={() => navigate({ to: "/mistakes" })} />
        <NavTile icon={<BarChart3 className="h-5 w-5" />} title="Mastery" body="Charts & insights" onClick={() => navigate({ to: "/analytics" })} />
        <NavTile icon={<History className="h-5 w-5" />} title="History" body="Past attempts" onClick={() => navigate({ to: "/history" })} />
      </div>

      {/* Compete */}
      <SectionHeading title="Compete" hint="Play & earn" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NavTile icon={<Swords className="h-5 w-5" />} title="Battle arena" body="10-question quick battle" onClick={() => navigate({ to: "/battle" })} />
        <NavTile icon={<Trophy className="h-5 w-5" />} title="Sunday Mega Test" body="₹10 entry · Big prizes" onClick={() => navigate({ to: "/battle/mega" })} />
        <NavTile icon={<UserIcon className="h-5 w-5" />} title="Wallet" body="Balance & withdrawals" onClick={() => navigate({ to: "/battle/wallet" })} />
      </div>

      {/* Social */}
      <SectionHeading title="Social" hint="Learn together" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NavTile icon={<Users className="h-5 w-5" />} title="Community" body="Forums, doubts, groups" onClick={() => navigate({ to: "/community" })} />
        <NavTile icon={<Bell className="h-5 w-5" />} title="Notifications" body="Your alerts" onClick={() => navigate({ to: "/notifications" })} />
        <NavTile
          icon={<UserIcon className="h-5 w-5" />}
          title="My profile"
          body="Public profile & badges"
          onClick={() => p && navigate({ to: "/profile/$userId", params: { userId: p.id } })}
        />
      </div>

      <OnboardingFlow open={needsOnboarding} />
    </AppShell>
  );
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 mt-8 flex items-end justify-between">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
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
    <div className="mantis-card p-4">
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
      className="mantis-tile group flex flex-col items-start gap-3 p-5 text-left"
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary shadow-inner ring-1 ring-inset ring-primary/10 transition-transform group-hover:scale-105">
        {icon}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
    </button>
  );
}
