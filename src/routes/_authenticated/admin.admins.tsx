import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { amIOwner, ownerListAdmins, ownerSetAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, ShieldPlus, Trash2, Crown } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/admin/admins")({
  head: () => ({
    meta: [
      { title: "Manage Admins — Last Topper" },
      { name: "description", content: "Owner-only control to add or remove administrators." },
      { property: "og:title", content: "Manage Admins" },
      {
        property: "og:description",
        content: "Owner-only control to add or remove administrators.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminsPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm">
      <p className="text-destructive">Failed: {failMessage(error)}</p>
      <button
        className="mt-3 rounded bg-primary px-3 py-1.5 text-primary-foreground"
        onClick={reset}
      >
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
});

function AdminsPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");

  const owner = useQuery({ queryKey: ["am-i-owner"], queryFn: () => amIOwner() });
  const list = useQuery({
    queryKey: ["owner-admins"],
    queryFn: () => ownerListAdmins(),
    enabled: !!owner.data?.owner,
  });

  const setAdmin = useMutation({
    mutationFn: (vars: { email?: string; user_id?: string; make: boolean }) =>
      ownerSetAdmin({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.make ? "Admin added" : "Admin removed");
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["owner-admins"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  if (owner.isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Checking access…</div>;

  if (!owner.data?.owner) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <Crown className="mx-auto h-6 w-6 text-muted-foreground" />
        <div className="mt-2 text-base font-semibold">Owner only</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Only the app owner can manage administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldPlus className="h-4 w-4 text-primary" /> Add an admin
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter the email of a user who has already signed up. They get full admin access instantly.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            setAdmin.mutate({ email: email.trim(), make: true });
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="h-10"
          />
          <Button type="submit" disabled={setAdmin.isPending} className="h-10">
            {setAdmin.isPending ? "Working…" : "Make admin"}
          </Button>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> Current admins
        </div>
        {list.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        ) : !list.data?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">No admins yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {list.data.map((a) => (
              <li key={a.user_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {a.full_name ?? "Unnamed"}
                    {a.is_owner && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Crown className="h-3 w-3" /> Owner
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {a.email ?? a.user_id}
                  </div>
                </div>
                {!a.is_owner && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setAdmin.isPending}
                    onClick={() => setAdmin.mutate({ user_id: a.user_id, make: false })}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
