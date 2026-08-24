import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { Check, Sparkles, ChevronLeft, Loader2, Gift } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getMyProfile } from "@/lib/user.functions";
import { getMyVouchers } from "@/lib/referral.functions";
import { checkPromoCode } from "@/lib/promo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { payWithRazorpay } from "@/lib/razorpay-client";
import { failMessage } from "@/lib/friendly-error";

const profileQuery = { queryKey: ["my-profile"], queryFn: () => getMyProfile() } as const;

export const Route = createFileRoute("/_authenticated/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Last Topper" },
      {
        name: "description",
        content: "Upgrade to Pro for unlimited AI question sets, priority battles, and more.",
      },
      { property: "og:title", content: "Pricing — Last Topper" },
      { property: "og:description", content: "Simple pricing. Practice more, rank higher." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  component: PricingPage,
});

const FREE = [
  "Up to 20 AI questions per set",
  "Full mistake bank & analytics",
  "Battle arena & Sunday Mega Test",
  "Community, doubts & groups",
];

const PRO = [
  "50 & 100 question sets",
  "Priority AI generation",
  "Everything in Free",
  "Early access to new features",
];

type Plan = "weekly" | "monthly" | "yearly";

function PricingPage() {
  const { data: p } = useSuspenseQuery(profileQuery);
  const qc = useQueryClient();
  const isPro = !!p?.is_pro;
  const [plan, setPlan] = useState<Plan>("yearly");
  const [loading, setLoading] = useState(false);
  const [promo, setPromo] = useState("");
  const [promoPercent, setPromoPercent] = useState(0);
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const vouchers = useQuery({ queryKey: ["my-vouchers"], queryFn: () => getMyVouchers() });
  const best = vouchers.data?.best ?? null;

  const voucherPercent = best?.percent ?? 0;
  const percentOff = Math.max(voucherPercent, promoPercent);
  const useVoucher = voucherPercent > 0 && voucherPercent >= promoPercent;

  const planKey = plan === "yearly" ? "pro_yearly" : plan === "weekly" ? "pro_weekly" : "pro";

  useEffect(() => {
    setPromoPercent(0);
    setPromoError(null);
  }, [plan]);

  const applyPromo = async () => {
    if (!promo.trim()) return;
    setPromoChecking(true);
    setPromoError(null);
    try {
      const r = await checkPromoCode({ data: { code: promo.trim().toUpperCase(), plan: planKey } });
      if (r.valid) {
        setPromoPercent(r.percent);
        toast.success(`Promo applied — ${r.percent}% off`);
      } else {
        setPromoPercent(0);
        setPromoError("This promo code is not valid for this plan");
      }
    } catch (e) {
      setPromoPercent(0);
      setPromoError(failMessage(e, "Could not check promo code"));
    } finally {
      setPromoChecking(false);
    }
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      await payWithRazorpay({
        purpose: planKey,
        name: p?.full_name,
        email: p?.email,
        voucher_code: useVoucher && best?.code ? best.code.toUpperCase() : undefined,
        promo_code:
          !useVoucher && promoPercent && promo.trim() ? promo.trim().toUpperCase() : undefined,
      });
      toast.success("Welcome to Pro! 🎉");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["my-vouchers"] });
    } catch (e) {
      const msg = failMessage(e, "Payment failed");
      if (msg !== "Payment cancelled") toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const base = plan === "yearly" ? 1499 : plan === "weekly" ? 49 : 149;
  const payable = percentOff ? Math.max(1, Math.round((base * (100 - percentOff)) / 100)) : base;
  const price = `₹${payable}`;
  const period = plan === "yearly" ? "/ year" : plan === "weekly" ? "/ week" : "/ month";
  const unit = plan === "yearly" ? "yr" : plan === "weekly" ? "wk" : "mo";
  const cta = `Subscribe ₹${payable}/${unit}`;
  const strike = percentOff ? `₹${base}` : undefined;

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-4">
          <Link to="/home" className="rounded-md p-2 hover:bg-accent" aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="text-base font-semibold">Pricing</div>
            <div className="text-xs text-muted-foreground">Simple, fair, exam-focused</div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Practice more. Rank higher.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Free forever for the essentials. Go Pro for unlimited AI practice.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setPlan("weekly")}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                plan === "weekly" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setPlan("monthly")}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                plan === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setPlan("yearly")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                plan === "yearly" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              Yearly
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                Save 16%
              </span>
            </button>
          </div>
        </div>

        {!isPro && (
          <div className="mx-auto mt-6 max-w-md rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Gift className="h-4 w-4 text-primary" /> Discounts
              </div>
              {percentOff > 0 && (
                <span className="whitespace-nowrap rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Best price · {percentOff}% off
                </span>
              )}
            </div>
            {best ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Your {best.percent}% referral voucher is ready and expires{" "}
                {new Date(best.expires_at as string).toLocaleDateString()}.
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Invite friends to earn referral vouchers, or apply a promotional code below.
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={promo}
                onChange={(e) => {
                  setPromo(e.target.value.toUpperCase());
                  setPromoPercent(0);
                  setPromoError(null);
                }}
                placeholder="Promo code"
                aria-label="Promo code"
                className="h-9"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={applyPromo}
                disabled={promoChecking || !promo.trim()}
              >
                {promoChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
            {promoPercent > 0 && (
              <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Promo verified: {promoPercent}% off. The larger available discount will be used.
              </p>
            )}
            {promoError && <p className="mt-2 text-xs text-destructive">{promoError}</p>}
            {voucherPercent > 0 && promoPercent > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {useVoucher
                  ? "Your referral voucher gives the best price."
                  : "Your promo code gives the best price."}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <PlanCard
            name="Free"
            price="₹0"
            tag="Everyone"
            features={FREE}
            cta={
              <Button variant="outline" className="w-full" disabled>
                Current plan
              </Button>
            }
          />
          <PlanCard
            highlight
            name="Pro"
            price={price}
            strike={strike}
            period={period}
            tag="Serious aspirants"
            features={PRO}

            cta={
              isPro ? (
                <Button className="w-full" disabled>
                  <Sparkles className="mr-2 h-4 w-4" /> You're Pro
                </Button>
              ) : (
                <Button className="w-full" onClick={subscribe} disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {loading ? "Opening checkout…" : cta}
                </Button>
              )
            }
          />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Cancel anytime. Prices in INR. Taxes may apply.
        </p>
      </section>
    </main>
  );
}

function PlanCard({
  name,
  price,
  strike,
  period,
  tag,
  features,
  cta,
  highlight,
}: {
  name: string;
  price: string;
  strike?: string;
  period?: string;
  tag: string;
  features: string[];
  cta: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`mantis-card p-6 ${highlight ? "ring-2 ring-primary/40" : ""}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">{name}</div>
          <div className="text-xs text-muted-foreground">{tag}</div>
        </div>
        {highlight && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
            <Sparkles className="h-3 w-3" /> Best value
          </span>
        )}
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        {strike && (
          <span className="mr-1 text-base text-muted-foreground line-through">{strike}</span>
        )}
        <span className="text-3xl font-bold">{price}</span>
        {period && <span className="text-sm text-muted-foreground">{period}</span>}
      </div>

      <ul className="mt-5 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{cta}</div>
    </div>
  );
}
