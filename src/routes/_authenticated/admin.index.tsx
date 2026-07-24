import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminStats, adminReportsChart } from "@/lib/admin.functions";
import { Users, MessageSquare, HelpCircle, Flag, Wallet, Swords } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => adminStats() });
  const chart = useQuery({ queryKey: ["admin-chart"], queryFn: () => adminReportsChart() });

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card icon={<Users className="h-4 w-4" />} label="Users" value={stats.data?.users ?? "—"} />
        <Card icon={<MessageSquare className="h-4 w-4" />} label="Posts" value={stats.data?.posts ?? "—"} />
        <Card icon={<HelpCircle className="h-4 w-4" />} label="Doubts" value={stats.data?.doubts ?? "—"} />
        <Card icon={<Flag className="h-4 w-4" />} label="Pending reports" value={stats.data?.pending_reports ?? "—"} />
        <Card icon={<Wallet className="h-4 w-4" />} label="Pending withdrawals" value={stats.data?.pending_withdrawals ?? "—"} />
        <Card icon={<Swords className="h-4 w-4" />} label="Battles played" value={stats.data?.completed_battles ?? "—"} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Signups (last 14 days)</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart.data?.signups ?? []}>
              <XAxis dataKey="day" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="signups" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
