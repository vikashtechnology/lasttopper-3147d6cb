import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getTournamentDetails } from "@/lib/tournament.functions";
import { AppShell, defaultNavGroups } from "@/components/shell/AppShell";
import { Trophy, Users, Info, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_authenticated/tournament/$tournamentId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData({
    queryKey: ["tournament", params.tournamentId],
    queryFn: () => getTournamentDetails({ data: { id: params.tournamentId } })
  }),
  component: TournamentDetailPage,
});

function TournamentDetailPage() {
    const { tournamentId } = Route.useParams();
    const { data: t } = useSuspenseQuery({
        queryKey: ["tournament", tournamentId],
        queryFn: () => getTournamentDetails({ data: { id: tournamentId } })
    });

    const groups = defaultNavGroups({});

    return (
        <AppShell header="MATCH DETAILS" groups={groups}>
            <div className="max-w-3xl mx-auto space-y-6">
                <Link to="/home" className="inline-flex items-center gap-2 text-xs uppercase font-bold text-muted-foreground hover:text-primary">
                    <ArrowLeft className="h-4 w-4" /> Back to Arena
                </Link>

                <Card className="bg-primary text-primary-foreground border-none overflow-hidden relative">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <Badge variant="outline" className="text-white border-white/20 uppercase text-[10px]">{t.status}</Badge>
                            <span className="text-[10px] font-bold uppercase tracking-widest">{t.match_format?.replace('_', ' ')}</span>
                        </div>
                        <CardTitle className="text-3xl font-black uppercase italic tracking-tighter mt-2">{t.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4 py-4">
                            <div className="text-center">
                                <p className="text-[10px] uppercase opacity-70">Entry Fee</p>
                                <p className="text-xl font-black italic">₹{t.entry_fee}</p>
                            </div>
                            <div className="text-center border-x border-white/10">
                                <p className="text-[10px] uppercase opacity-70">Prize Pool</p>
                                <p className="text-xl font-black italic">₹{t.prize_pool}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] uppercase opacity-70">Starts On</p>
                                <p className="text-xs font-bold uppercase">{new Date(t.start_date).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                    <Card className="mantis-card">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold uppercase italic flex items-center gap-2">
                                <Info className="h-4 w-4 text-primary" />
                                Rules & Scoring
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                <ScoringItem label="Winner (WWCD)" value={(t.scoring_rules as any)?.wwcd || 15} />
                                <ScoringItem label="Per Kill" value={(t.scoring_rules as any)?.kill || 1} />
                                <ScoringItem label="2nd Place" value={(t.scoring_rules as any)?.placement_2nd || 10} />
                            </div>
                            <Separator />
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                {t.description || "Standard esports scoring rules apply. Ensure your BGMI UID is verified before joining the room. Room ID will be visible 5 mins before start."}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="mantis-card bg-muted/30">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold uppercase italic flex items-center gap-2">
                                <Users className="h-4 w-4 text-primary" />
                                Slots Left
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="text-center">
                                <div className="text-4xl font-black italic text-primary">
                                    {t.max_teams - (t.registered_teams_count || 0)}
                                </div>
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Teams can still join</p>
                            </div>
                            
                            <Button className="w-full h-12 uppercase font-black italic tracking-tight text-lg shadow-lg shadow-primary/20">
                                Register Team
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppShell>
    );
}

function ScoringItem({ label, value }: { label: string, value: any }) {
    return (
        <div className="bg-muted p-2 rounded-lg text-center">
            <p className="text-[8px] uppercase text-muted-foreground font-bold">{label}</p>
            <p className="text-sm font-bold">+{value} PTS</p>
        </div>
    )
}
