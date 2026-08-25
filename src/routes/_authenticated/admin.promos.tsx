import { createFileRoute } from "@tanstack/react-router";
import { Ban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/promos")({
  component: PromoCodesDisabled,
});

function PromoCodesDisabled() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-base font-semibold">
          <Ban className="h-5 w-5 text-destructive" /> Promo codes disabled
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          One-time Pro passes use the fixed published prices: ₹49 for 7 days, ₹149 for 30 days, and
          ₹1,499 for 365 days. Discount creation and redemption are disabled so payment amount and
          fulfillment remain deterministic and replay-safe.
        </p>
      </div>
    </section>
  );
}
