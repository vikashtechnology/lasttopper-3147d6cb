import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare, HelpCircle, Users, Activity, Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { unreadNotificationsCount } from "@/lib/community.functions";
import { useMonetagAds } from "@/lib/useMonetagAds";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({
    meta: [
      { title: "Community — Last Topper" },
      { name: "description", content: "Forums, doubt corner, study groups, and public profiles." },
      { property: "og:title", content: "Community — Last Topper" },
      { property: "og:description", content: "Discuss, ask, and study together." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommunityLayout,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm">
      <p className="text-destructive">Failed: {error.message}</p>
      <button className="mt-3 rounded bg-primary px-3 py-1.5 text-primary-foreground" onClick={reset}>Retry</button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
});

function CommunityLayout() {
  useMonetagAds();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const unread = useQuery({ queryKey: ["notif-unread"], queryFn: () => unreadNotificationsCount(), refetchInterval: 30000 });

  const tabs = [
    { to: "/community", icon: MessageSquare, label: "Forums" },
    { to: "/community/doubts", icon: HelpCircle, label: "Doubts" },
    { to: "/community/groups", icon: Users, label: "Groups" },
    { to: "/community/feed", icon: Activity, label: "Feed" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <button onClick={() => navigate({ to: "/home" })} className="rounded-full p-2 text-muted-foreground hover:text-foreground" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-semibold">Community</h1>
          <div className="ml-auto">
            <Link to="/notifications" className="relative inline-flex items-center rounded-full p-2 text-muted-foreground hover:text-foreground">
              <Bell className="h-4 w-4" />
              {unread.data && unread.data.count > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unread.data.count}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-2 pb-2">
          {tabs.map((t) => {
            const active = t.to === "/community"
              ? path === "/community" || path.startsWith("/community/forum") || path.startsWith("/community/post")
              : path.startsWith(t.to);
            return (
              <Link
                key={t.to} to={t.to}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
