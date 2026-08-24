import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getActivityFeed } from "@/lib/community.functions";
import { Activity, TrendingUp, HelpCircle, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/community/feed")({
  component: Feed,
});

function Feed() {
  const feed = useQuery({ queryKey: ["activity-feed"], queryFn: () => getActivityFeed() });

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          Trending doubts
        </h2>
        <div className="space-y-2">
          {feed.data?.trending_doubts.map((d) => (
            <Link
              key={d.id}
              to="/community/doubt/$doubtId"
              params={{ doubtId: d.id }}
              className="block rounded-xl border border-border bg-card p-3 text-sm hover:bg-muted/50"
            >
              <div className="font-medium">{d.title}</div>
              <div className="text-xs text-muted-foreground">
                ↑ {d.upvote_count} · 💬 {d.reply_count}
              </div>
            </Link>
          ))}
          {feed.data && feed.data.trending_doubts.length === 0 && (
            <div className="text-sm text-muted-foreground">No trending doubts.</div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Activity className="h-4 w-4" />
          Following
        </h2>
        <div className="space-y-2">
          {feed.data?.events.map((e) => (
            <div key={e.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex items-center gap-2">
                {e.kind === "doubt_created" ? (
                  <HelpCircle className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                )}
                <span className="font-medium">{e.author?.full_name ?? "Someone"}</span>
                <span className="text-muted-foreground">
                  {e.kind === "doubt_created" ? "asked a doubt" : "created a post"}
                </span>
              </div>
              {typeof e.payload === "object" && e.payload && "title" in e.payload && (
                <div className="mt-1 text-muted-foreground">
                  {String((e.payload as Record<string, unknown>).title)}
                </div>
              )}
            </div>
          ))}
          {feed.data && feed.data.events.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Follow people to see their activity here.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
