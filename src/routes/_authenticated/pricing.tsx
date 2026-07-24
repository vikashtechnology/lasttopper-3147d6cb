import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Check, Sparkles, ChevronLeft } from "lucide-react";
import { getMyProfile } from "@/lib/user.functions";
import { Button } from "@/components/ui/button";

const profileQuery = { queryKey: ["my-profile"], queryFn: () => getMyProfile() } as const;

export const Route = createFileRoute("/_authenticated/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Last Topper" },
      { name: "description", content: "Upgrade to Pro for unlimited AI question sets, priority battles, and more." },
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

function PricingPage() {
  const { data: p } = useSuspenseQuery(profileQuery);
  const isPro = !!p?.is_pro;

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
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Practice more. Rank higher.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Free forever for the essentials. Go Pro for unlimited AI practice.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <Plan
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
          <Plan
            highlight
            name="Pro"
            price="₹149"
            period="/ month"
            tag="Serious aspirants"
            features={PRO}
            cta={
              isPro ? (
                <Button className="w-full" disabled>
                  <Sparkles className="mr-2 h-4 w-4" /> You're Pro
                </Button>
              ) : (
                <Button className="w-full" disabled>
                  Checkout coming soon
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

function Plan({
  name,
  price,
  period,
  tag,
  features,
  cta,
  highlight,
}: {
  name: string;
  price: string;
  period?: string;
  tag: string;
  features: string[];
  cta: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`mantis-card p-6 ${
        highlight ? "ring-2 ring-primary/40" : ""
      }`}
    >
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
