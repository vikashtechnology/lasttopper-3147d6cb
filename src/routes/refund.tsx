import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Last Topper" },
      {
        name: "description",
        content: "How refunds work for one-time Last Topper Pro passes.",
      },
      { property: "og:title", content: "Refund Policy — Last Topper" },
      {
        property: "og:description",
        content: "How refunds work for one-time Last Topper Pro passes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">Refund Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: August 25, 2026</p>

      <section className="prose prose-slate mt-8 max-w-none space-y-6 text-sm leading-6 text-foreground">
        <p>
          This policy covers payments made directly to Last Topper through the payment provider on
          our official website or Android app. Last Topper is not sold through Google Play or the
          Apple App Store.
        </p>

        <h2 className="text-lg font-semibold">1. One-time Pro passes</h2>
        <ul className="list-disc pl-5">
          <li>Pro passes last 7, 30, or 365 days and use a one-time payment.</li>
          <li>They are not subscriptions, do not auto-renew, and do not require cancellation.</li>
          <li>
            A verified payment activates or extends Pro for the duration shown before checkout.
          </li>
          <li>
            We generally do not refund an activated pass merely because it was partly used or no
            longer wanted. This does not limit rights that cannot be excluded under applicable law.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">2. Duplicate, incorrect, or unfulfilled charges</h2>
        <p>
          Contact support within 7 days if you believe you were charged more than once, charged an
          incorrect amount, charged after a failed checkout, or did not receive Pro after a captured
          payment. Include the email linked to your account, payment ID, order ID, date, amount, and
          a brief description. We will verify the payment and either fulfill the purchased pass or,
          when appropriate, initiate a refund to the original payment method.
        </p>

        <h2 className="text-lg font-semibold">3. Processing</h2>
        <p>
          Approved refunds are sent through the original payment provider. Bank or payment-network
          processing times vary and are outside our direct control. Refunds are not issued as app
          points, credits, or competition benefits.
        </p>

        <h2 className="text-lg font-semibold">4. Learning and competitions</h2>
        <ul className="list-disc pl-5">
          <li>
            Quick Battles, 1v1 Battles, daily challenges, and Sunday Mega Test registration do not
            have an entry fee, so there is no competition-entry charge to refund.
          </li>
          <li>
            Mega Test access tasks establish eligibility only. Completing or failing a task is not a
            purchase and does not create a refundable entitlement.
          </li>
          <li>Scores, ranks, XP, streaks, and recognition are not purchases or payment methods.</li>
          <li>
            The 7-day Pro extension awarded to the Sunday Mega Test's final rank #1 is a
            non-purchased competition prize and has no refundable cash value.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">5. How to request help</h2>
        <p>
          Contact the Last Topper team through the in-app support option from the affected account.
          We aim to review complete requests promptly, but complex provider investigations may take
          longer.
        </p>

        <h2 className="text-lg font-semibold">6. Changes</h2>
        <p>We may update this policy and will publish the revised date on this page.</p>

        <p className="text-xs text-muted-foreground">
          See also:{" "}
          <Link to="/terms" className="underline">
            Terms &amp; Conditions
          </Link>{" "}
          ·{" "}
          <Link to="/privacy" className="underline">
            Privacy Policy
          </Link>
        </p>
      </section>
    </main>
  );
}
