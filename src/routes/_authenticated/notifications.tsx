import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { listNotifications, markNotificationsRead } from "@/lib/community.functions";
import { ArrowLeft, Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => markRead.mutate()}>
            <Check className="mr-1 h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-6 space-y-2">
        {list.data?.length ? (
          list.data.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (n.link) navigate({ to: n.link });
              }}
              className={`cursor-pointer rounded-xl border p-4 ${n.read_at ? "border-border bg-card" : "border-primary/40 bg-primary/5"}`}
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
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            You're all caught up 🎉
          </div>
        )}
      </section>
    </main>
  );
}
