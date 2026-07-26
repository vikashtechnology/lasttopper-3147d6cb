import { createFileRoute, Link, Outlet, useNavigate, useRouterState, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { amIAdmin } from "@/lib/admin.functions";
import { ArrowLeft, LayoutDashboard, Users, Flag, Wallet, Database } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Last Topper" },
      { name: "description", content: "Administrator dashboard." },
      { property: "og:title", content: "Admin" },
      { property: "og:description", content: "Administrator dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLayout,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm">
      <p className="text-destructive">Failed: {error.message}</p>
      <button className="mt-3 rounded bg-primary px-3 py-1.5 text-primary-foreground" onClick={reset}>Retry</button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
});

function AdminLayout() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const check = useQuery({ queryKey: ["am-i-admin"], queryFn: () => amIAdmin() });

  if (check.isLoading) return <div className="p-6 text-sm">Checking access…</div>;
  if (!check.data?.admin) {
    return (
      <div className="mx-auto mt-20 max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <div className="text-lg font-semibold">Admin access required</div>
        <p className="mt-2 text-sm text-muted-foreground">You don't have permission to view this page.</p>
        <button className="mt-4 rounded bg-primary px-3 py-1.5 text-primary-foreground" onClick={() => navigate({ to: "/home" })}>
          Back to home
        </button>
      </div>
    );
  }

  const tabs = [
    { to: "/admin", icon: LayoutDashboard, label: "Overview" },
    { to: "/admin/users", icon: Users, label: "Users" },
    { to: "/admin/moderation", icon: Flag, label: "Moderation" },
    { to: "/admin/withdrawals", icon: Wallet, label: "Withdrawals" },
    { to: "/admin/bank", icon: Database, label: "Question Bank" },
  ];


  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button onClick={() => navigate({ to: "/home" })} className="rounded-full p-2"><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="text-base font-semibold">Admin</h1>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2">
          {tabs.map((t) => {
            const active = t.to === "/admin" ? path === "/admin" : path.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}>
                <t.icon className="h-3.5 w-3.5" />{t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
