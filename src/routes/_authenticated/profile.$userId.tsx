import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { firebaseClient } from "@/integrations/firebase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPublicProfile, followUser, unfollowUser } from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Flame, Target, Award, ArrowLeft, UserPlus, UserMinus, LogOut } from "lucide-react";
import { useUserStore } from "@/store/user";
import { toast } from "sonner";
import { failMessage } from "@/lib/friendly-error";
import { RankBadge } from "@/components/RankBadge";
import { SocialLinksRow } from "@/components/SocialLinks";

export const Route = createFileRoute("/_authenticated/profile/$userId")({
  head: () => ({
    meta: [
      { title: "Profile — Last Topper" },
      { name: "description", content: "User profile, badges, and stats." },
      { property: "og:title", content: "Profile — Last Topper" },
      { property: "og:description", content: "User profile page." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { userId } = useParams({ from: "/_authenticated/profile/$userId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const meId = useUserStore((s) => s.profile?.id);
  const p = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getPublicProfile({ data: { user_id: userId } }),
  });

  const follow = useMutation({
    mutationFn: () => followUser({ data: { user_id: userId } }),
    onSuccess: () => {
      toast.success("Following");
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });
  const unfollow = useMutation({
    mutationFn: () => unfollowUser({ data: { user_id: userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", userId] }),
  });

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    useUserStore.getState().clear();
    await firebaseClient.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (p.isLoading) return <div className="p-6 text-sm">Loading…</div>;
  if (!p.data?.user) return <div className="p-6 text-sm">User not found.</div>;
  const u = p.data.user;
  const isMe = meId === userId;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate({ to: "/community" })}
            className="rounded-full p-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-semibold">Profile</h1>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={u.avatar_url ?? undefined} />
            <AvatarFallback>{(u.full_name ?? "?").slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="text-xl font-semibold">{u.full_name ?? "Anonymous"}</div>
            <div className="text-xs text-muted-foreground">
              {u.profession?.toUpperCase()} · rep {u.reputation}
            </div>
            <RankBadge xp={Number(u.reputation ?? 0)} showProgress className="mt-2 max-w-[220px]" />
            {u.bio && <p className="mt-2 text-sm">{u.bio}</p>}
            <div className="mt-2 text-xs text-muted-foreground">
              {p.data.followers_count} followers · {p.data.following_count} following
            </div>
            {!isMe ? (
              <div className="mt-3">
                {p.data.i_follow ? (
                  <Button size="sm" variant="outline" onClick={() => unfollow.mutate()}>
                    <UserMinus className="mr-1 h-3.5 w-3.5" />
                    Unfollow
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => follow.mutate()}>
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    Follow
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={handleSignOut}>
                  <LogOut className="mr-1 h-3.5 w-3.5" />
                  Sign out
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat icon={<Flame className="h-4 w-4" />} label="Streak" value={`${u.streak}d`} />
          <Stat
            icon={<Target className="h-4 w-4" />}
            label="Accuracy"
            value={`${Math.round(Number(u.total_accuracy ?? 0))}%`}
          />
          <Stat icon={<Award className="h-4 w-4" />} label="XP" value={String(u.reputation)} />
        </div>

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Badges</h2>
          {p.data.badges.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No badges yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {p.data.badges.map((b) => (
                <div key={b.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="text-2xl">{b.icon ?? "🏅"}</div>
                  <div className="mt-1 text-sm font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <SocialLinksRow className="mt-8 border-t border-border pt-6" />
      </section>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
