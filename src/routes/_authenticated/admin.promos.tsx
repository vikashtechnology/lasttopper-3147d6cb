import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Ticket } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";
import {
  adminListPromoCodes,
  adminSavePromoCode,
  adminDeletePromoCode,
} from "@/lib/promo.functions";

export const Route = createFileRoute("/_authenticated/admin/promos")({
  head: () => ({
    meta: [
      { title: "Promo Codes — Admin — Last Topper" },
      { name: "description", content: "Create discount promo codes for Pro subscription plans." },
      { property: "og:title", content: "Promo Codes — Admin" },
      { property: "og:description", content: "Manage Pro subscription promo codes and discounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPromos,
});

const PLANS = [
  { key: "pro_weekly", label: "Weekly" },
  { key: "pro", label: "Monthly" },
  { key: "pro_yearly", label: "Yearly" },
] as const;

type PlanKey = (typeof PLANS)[number]["key"];

function AdminPromos() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-promos"], queryFn: () => adminListPromoCodes() });

  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("20");
  const [validUntil, setValidUntil] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [plans, setPlans] = useState<PlanKey[]>(["pro_weekly", "pro", "pro_yearly"]);

  const save = useMutation({
    mutationFn: (row: Parameters<typeof adminSavePromoCode>[0]["data"]) =>
      adminSavePromoCode({ data: row }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-promos"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDeletePromoCode({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-promos"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  const togglePlan = (k: PlanKey) =>
    setPlans((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const create = () => {
    const pct = Number(percent);
    if (!code.trim()) return toast.error("Enter a code");
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) return toast.error("Discount must be 1–100%");
    if (plans.length === 0) return toast.error("Pick at least one plan");
    save.mutate({
      code: code.trim().toUpperCase(),
      percent: pct,
      plans,
      valid_until: validUntil ? validUntil : null,
      max_uses: maxUses ? Number(maxUses) : null,
      is_active: true,
    });
    setCode("");
    setMaxUses("");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mantis-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Ticket className="h-4 w-4 text-primary" /> New promo code
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground">Promo code</label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TOPPER50" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Discount %</label>
            <Input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="numeric" placeholder="20" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Valid until</label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Max uses (optional)</label>
            <Input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} inputMode="numeric" placeholder="Unlimited" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs text-muted-foreground">Applies to plans</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLANS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => togglePlan(p.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  plans.includes(p.key) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <Button className="mt-4" onClick={create} disabled={save.isPending}>
          <Plus className="mr-2 h-4 w-4" /> Create code
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {list.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {list.data?.length === 0 && (
          <div className="text-sm text-muted-foreground">No promo codes yet.</div>
        )}
        {list.data?.map((p) => (
          <div key={p.id} className="mantis-card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-40 flex-1">
              <div className="font-mono text-sm font-semibold">{p.code}</div>
              <div className="text-xs text-muted-foreground">
                {p.percent}% off ·{" "}
                {p.plans
                  .map((k) => PLANS.find((x) => x.key === k)?.label ?? k)
                  .join(", ")}
                {p.valid_until ? ` · till ${new Date(p.valid_until).toLocaleDateString()}` : " · no expiry"}
                {` · used ${p.used_count}${p.max_uses ? `/${p.max_uses}` : ""}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Active</span>
              <Switch
                checked={p.is_active}
                onCheckedChange={(v) =>
                  save.mutate({
                    id: p.id,
                    code: p.code,
                    percent: p.percent,
                    plans: p.plans as PlanKey[],
                    valid_until: p.valid_until,
                    max_uses: p.max_uses,
                    is_active: v,
                    note: p.note,
                  })
                }
              />
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
