import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home as HomeIcon,
  BookOpen,
  BookMarked,
  AlertOctagon,
  BarChart3,
  History,
  Swords,
  Trophy,
  Users,
  Bell,
  User as UserIcon,
  ShieldCheck,
  Menu,
  X,
  CalendarCheck,
  Repeat2,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SocialLinksDropdown } from "@/components/SocialLinks";

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  params?: Record<string, string>;
  exact?: boolean;
};

export type NavGroup = { title: string; items: NavItem[] };

export const defaultNavGroups = (opts: { profileUserId?: string; admin?: boolean }): NavGroup[] => {
  const groups: NavGroup[] = [
    {
      title: "Overview",
      items: [
        {
          to: "/home",
          label: "Dashboard",
          icon: <HomeIcon className="h-4 w-4" />,
          exact: true,
        },
      ],
    },
    {
      title: "Practice",
      items: [
        { to: "/learning", label: "Chapter practice", icon: <BookOpen className="h-4 w-4" /> },
        {
          to: "/daily",
          label: "Daily challenge",
          icon: <CalendarCheck className="h-4 w-4" />,
        },
        { to: "/review", label: "Smart review", icon: <Repeat2 className="h-4 w-4" /> },
        { to: "/pyq", label: "Previous years", icon: <ScrollText className="h-4 w-4" /> },
        { to: "/revise", label: "Revision notes", icon: <BookMarked className="h-4 w-4" /> },
        { to: "/mistakes", label: "Mistake bank", icon: <AlertOctagon className="h-4 w-4" /> },
        { to: "/analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
        { to: "/history", label: "Quiz history", icon: <History className="h-4 w-4" /> },
      ],
    },
    {
      title: "Compete",
      items: [
        {
          to: "/battle",
          label: "Battle arena",
          icon: <Swords className="h-4 w-4" />,
          exact: true,
        },
        { to: "/battle/mega", label: "Sunday Mega", icon: <Trophy className="h-4 w-4" /> },
      ],
    },
    {
      title: "Community",
      items: [
        { to: "/community", label: "Community", icon: <Users className="h-4 w-4" /> },
        { to: "/notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
      ],
    },
    {
      title: "Account",
      items: [
        ...(opts.profileUserId
          ? [
              {
                to: "/profile/$userId",
                params: { userId: opts.profileUserId },
                label: "My profile",
                icon: <UserIcon className="h-4 w-4" />,
              },
            ]
          : []),
        { to: "/pricing", label: "Plans & Pro", icon: <Sparkles className="h-4 w-4" /> },
      ],
    },
  ];
  if (opts.admin) {
    groups.push({
      title: "Admin",
      items: [{ to: "/admin", label: "Admin console", icon: <ShieldCheck className="h-4 w-4" /> }],
    });
  }
  return groups;
};

export function AppShell({
  header,
  headerActions,
  groups,
  children,
  footerNote,
}: {
  header: ReactNode;
  headerActions?: ReactNode;
  groups: NavGroup[];
  children: ReactNode;
  footerNote?: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const isActive = (to: string, exact = false) =>
    pathname === to || (!exact && pathname.startsWith(to + "/"));

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 text-foreground">
      {/* Top header */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link
            to="/home"
            className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Last Topper dashboard"
          >
            <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl shadow-lg shadow-primary/20 ring-1 ring-border">
              <img src="/app-icon-192.png" alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">Last Topper</div>
              <div className="truncate text-xs text-muted-foreground">{header}</div>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {headerActions}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Sidebar — desktop */}
        <aside className="sticky top-[72px] hidden h-[calc(100vh-96px)] w-60 shrink-0 lg:block">
          <nav className="mantis-card h-full overflow-y-auto p-3">
            {groups.map((g) => (
              <div key={g.title} className="mb-4 last:mb-0">
                <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.title}
                </div>
                <ul className="space-y-0.5">
                  {g.items.map((it) => (
                    <li key={it.to + JSON.stringify(it.params ?? {})}>
                      <Link
                        to={it.to as never}
                        params={it.params as never}
                        className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                          isActive(it.to, it.exact)
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-foreground/80 hover:bg-accent"
                        }`}
                      >
                        {it.icon}
                        <span>{it.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <SocialLinksDropdown />
          </nav>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
            <div
              id="mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-menu-title"
              className="absolute left-0 top-0 h-full w-72 overflow-y-auto border-r border-border bg-background p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <span id="mobile-menu-title" className="text-sm font-semibold">
                  Menu
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  autoFocus
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {groups.map((g) => (
                <div key={g.title} className="mb-4">
                  <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.title}
                  </div>
                  <ul className="space-y-0.5">
                    {g.items.map((it) => (
                      <li key={it.to + JSON.stringify(it.params ?? {})}>
                        <Link
                          to={it.to as never}
                          params={it.params as never}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                            isActive(it.to, it.exact)
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-foreground/80 hover:bg-accent"
                          }`}
                        >
                          {it.icon}
                          <span>{it.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <SocialLinksDropdown onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* Main */}
        <main className="min-w-0 flex-1 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* Compact footer — primary navigation already lives in the sidebar. */}
      <footer className="hidden border-t border-border/70 bg-background/60 lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-8 py-4 text-[11px] text-muted-foreground">
          <span>{footerNote}</span>
          <nav className="ml-auto flex items-center gap-4" aria-label="Legal">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/refund" className="hover:text-foreground">
              Refunds
            </Link>
          </nav>
        </div>
      </footer>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 py-1.5">
          <BottomLink
            to="/home"
            label="Home"
            icon={<HomeIcon className="h-5 w-5" />}
            active={isActive("/home")}
          />
          <BottomLink
            to="/learning"
            label="Learn"
            icon={<BookOpen className="h-5 w-5" />}
            active={isActive("/learning")}
          />
          <BottomLink
            to="/battle"
            label="Battle"
            icon={<Swords className="h-5 w-5" />}
            active={isActive("/battle")}
          />
          <BottomLink
            to="/community"
            label="Community"
            icon={<Users className="h-5 w-5" />}
            active={isActive("/community")}
          />
          <BottomLink
            to="/notifications"
            label="Alerts"
            icon={<Bell className="h-5 w-5" />}
            active={isActive("/notifications")}
          />
        </div>
      </nav>
    </div>
  );
}

function BottomLink({
  to,
  label,
  icon,
  active,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      to={to as never}
      className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
