import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { getProfile, getTournaments } from "@/lib/tournament.functions";
import { amIAdmin } from "@/lib/admin.functions";
import { AppShell, defaultNavGroups } from "@/components/shell/AppShell";
import { Trophy, Users, History, LayoutDashboard, Calendar, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const profileQuery = {
  queryKey: ["my-profile"],
  queryFn: () => getProfile(),
} as const;

const tournamentsQuery = {
  queryKey: ["upcoming-tournaments", "upcoming"],
  queryFn: () => getTournaments({ data: { status: "upcoming" } }),
} as const;

export const Route = createFileRoute("/_authenticated/home")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(profileQuery),
    context.queryClient.ensureQueryData(tournamentsQuery),
  ]),
  component: TournamentHomePage,
});

function TournamentHomePage() {
  const navigate = useNavigate();
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: tournaments } = useSuspenseQuery(tournamentsQuery);
  const admin = useQuery({ queryKey: ["am-i-admin"], queryFn: () => amIAdmin() });

  const groups = defaultNavGroups({ profileUserId: profile?.id, admin: admin.data?.admin });

  return (
    <AppShell
      header="Last Topper"
      groups={groups}
      footerNote={<>© {new Date().getFullYear()} Last Topper — Master Your Future.</>}
      headerActions={
        <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                ₹{profile?.total_winnings ?? 0}
            </Badge>
            {profile?.id && (
                <Link to="/profile/$userId" params={{ userId: profile.id }}>
                    <Button variant="ghost" size="icon" className="rounded-full">
                        <Users className="h-4 w-4" />
                    </Button>
                </Link>
            )}
        </div>
      }
    >
      <section className="mb-8">
        <Card className="bg-primary text-primary-foreground border-none shadow-xl shadow-primary/20 overflow-hidden relative">
          <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
          <CardHeader>
            <CardTitle className="text-2xl font-bold uppercase italic tracking-tighter">Your Stats</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase opacity-70">Total Winnings</p>
              <p className="text-3xl font-black italic">₹{profile?.total_winnings ?? 0}</p>
            </div>
            <div>
              <p className="text-xs uppercase opacity-70">K/D Ratio</p>
              <p className="text-3xl font-black italic">{profile?.kd_ratio?.toFixed(2) ?? "0.00"}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold uppercase tracking-tight italic flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Active Tournaments
        </h2>
        <Button variant="link" size="sm" className="text-xs uppercase">View All</Button>
      </div>

      <div className="grid gap-4">
        {tournaments?.map((t: any) => (
          <Card key={t.id} className="mantis-tile overflow-hidden group">
            <div className="p-4 flex gap-4">
                <div className="w-16 h-16 bg-muted rounded-xl flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                    <Swords className="h-8 w-8 text-muted-foreground group-hover:text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-[10px] uppercase h-4 px-1">{t.match_format?.replace('_', ' ')}</Badge>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Starts {new Date(t.start_date).toLocaleDateString()}</span>
                    </div>
                    <h3 className="font-bold truncate text-sm uppercase italic">{t.title}</h3>
                    <div className="flex gap-4 mt-2">
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Entry Fee</p>
                            <p className="text-xs font-bold">₹{t.entry_fee}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Prize Pool</p>
                            <p className="text-xs font-bold text-primary">₹{t.prize_pool}</p>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col justify-center">
                    <Button size="sm" className="uppercase text-[10px] font-black italic h-8 px-4" asChild>
                        <Link to="/home">Join</Link>
                    </Button>
                </div>
            </div>
          </Card>
        ))}
        {(!tournaments || tournaments.length === 0) && (
            <div className="text-center py-12 border-2 border-dashed rounded-2xl border-muted">
                <p className="text-sm text-muted-foreground uppercase tracking-widest italic">No active tournaments found</p>
            </div>
        )}
      </div>

      <SectionHeading title="Quick Links" />
      <div className="grid grid-cols-2 gap-4">
        <NavTile icon={<Users className="h-5 w-5" />} title="My Teams" body="Manage your squads" onClick={() => navigate({ to: "/home" })} />
        <NavTile icon={<History className="h-5 w-5" />} title="Match History" body="Your past performances" onClick={() => navigate({ to: "/home" })} />
        <NavTile icon={<Calendar className="h-5 w-5" />} title="Schedule" body="Upcoming match dates" onClick={() => navigate({ to: "/home" })} />
        <NavTile icon={<LayoutDashboard className="h-5 w-5" />} title="Leaderboard" body="Top global players" onClick={() => navigate({ to: "/home" })} />
      </div>

    </AppShell>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="mb-3 mt-8">
      <h2 className="text-lg font-bold uppercase tracking-tight italic">{title}</h2>
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
      className="mantis-tile group flex flex-col items-start gap-3 p-5 text-left w-full"
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-transform group-hover:scale-105 group-hover:bg-primary/10 group-hover:text-primary">
        {icon}
      </span>
      <div>
        <div className="text-sm font-bold uppercase italic">{title}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-tight">{body}</div>
      </div>
    </button>
  );
}
