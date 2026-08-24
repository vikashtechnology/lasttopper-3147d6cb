import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { listNotifications, markNotificationsRead } from "@/lib/community.functions";
import { ArrowLeft, Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { failMessage } from "@/lib/friendly-error";
import { toast } from "sonner";
import { useUserStore } from "@/store/user";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Last Topper" },
      { name: "description", content: "Your in-app notifications." },
      { property: "og:title", content: "Notifications" },
      { property: "og:description", content: "Stay up to date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Notifications,
});

function Notifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const meId = useUserStore((s) => s.profile?.id);
  const list = useQuery({ queryKey: ["notifications"], queryFn: () => listNotifications() });

  useEffect(() => {
    if (!meId) return;
    const ch = supabase
      .channel(`notif-${meId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications"] });
          qc.invalidateQueries({ queryKey: ["notif-unread"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [meId, qc]);

  const markRead = useMutation({
    mutationFn: () => markNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
    },
  });

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button onClick={() => navigate({ to: "/home" })} className="rounded-full p-2">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-semibold">Notifications</h1>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={markRead.isPending || !list.data?.some((item) => !item.read_at)}
            onClick={() => markRead.mutate()}
          >
            {markRead.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1 h-3.5 w-3.5" />
            )}
            {markRead.isPending ? "Marking…" : "Mark all read"}
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-3xl space-y-2 px-4 py-6" aria-live="polite">
        {list.isLoading && (
          <div className="mantis-card flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…
          </div>
        )}
        {list.isError && (
          <div className="mantis-card p-6 text-center">
            <h2 className="text-sm font-semibold">Notifications did not load</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Please check your connection and try again.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => list.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {list.isSuccess &&
          list.data.length > 0 &&
          list.data.map((n) => (
            <div
              key={n.id}
              role={n.link ? "link" : undefined}
              tabIndex={n.link ? 0 : undefined}
              onClick={() => {
                if (n.link) navigate({ to: n.link });
              }}
              onKeyDown={(event) => {
                if (n.link && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  navigate({ to: n.link });
                }
              }}
              className={`rounded-xl border p-4 transition-colors ${
                n.read_at ? "border-border bg-card" : "border-primary/40 bg-primary/5"
              } ${n.link ? "cursor-pointer hover:border-primary/60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-4 w-4 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">{n.title}</div>
                  {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
                {!n.read_at && (
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                )}
              </div>
            </div>
          ))}
        {list.isSuccess && list.data.length === 0 && (
          <div className="mantis-card border-dashed p-8 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">You're all caught up</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              New study reminders and community updates will appear here.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
