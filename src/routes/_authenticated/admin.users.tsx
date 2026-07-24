import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminListUsers, adminSetBan } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Shield, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users", q], queryFn: () => adminListUsers({ data: { q: q || undefined } }) });

  const ban = useMutation({
    mutationFn: (v: { user_id: string; banned: boolean }) => adminSetBan({ data: v }),
    onSuccess: (_r, v) => { toast.success(v.banned ? "Banned" : "Unbanned"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      <Input placeholder="Search by email, name, phone…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4" />
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Prof.</th>
              <th className="p-3">Rep</th>
              <th className="p-3">Streak</th>
              <th className="p-3">Balance</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-3">
                  <div className="font-medium">{u.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="p-3 text-xs uppercase">{u.profession ?? "—"}</td>
                <td className="p-3">{u.reputation}</td>
                <td className="p-3">{u.streak}</td>
                <td className="p-3">₹{Number(u.balance).toFixed(2)}</td>
                <td className="p-3">
                  {u.is_banned
                    ? <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600">Banned</span>
                    : <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">Active</span>}
                </td>
                <td className="p-3 text-right">
                  {u.is_banned ? (
                    <Button size="sm" variant="outline" onClick={() => ban.mutate({ user_id: u.id, banned: false })}>
                      <ShieldOff className="mr-1 h-3.5 w-3.5" />Unban
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => ban.mutate({ user_id: u.id, banned: true })}>
                      <Shield className="mr-1 h-3.5 w-3.5" />Ban
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
