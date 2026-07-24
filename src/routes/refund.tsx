import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Last Topper" },
      { name: "description", content: "How refunds work for Last Topper Pro subscriptions, Sunday Mega Test entries, and wallet withdrawals." },
      { property: "og:title", content: "Refund Policy — Last Topper" },
      { property: "og:description", content: "How refunds work for Last Topper Pro subscriptions, Sunday Mega Test entries, and wallet withdrawals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">← Home</Link>
      <h1 className="mt-4 text-3xl font-semibold">Refund Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: July 24, 2026</p>

      <section className="prose prose-slate mt-8 max-w-none space-y-6 text-sm leading-6 text-foreground">
        <p>
          This page explains how refunds work across Last Topper. It is maintained
          by the Last Topper team and may be updated as the product evolves.
        </p>

        <h2 className="text-lg font-semibold">1. Pro subscription</h2>
        <ul className="list-disc pl-5">
          <li>Pro is a recurring subscription billed through our payments provider.</li>
          <li>You can cancel any time; cancellation stops the next renewal. The current billing period continues until it ends.</li>
          <li>We generally do not refund partial or unused subscription periods. If you were charged in error or hit a technical issue that blocked usage, contact support within 7 days of the charge and we'll review it.</li>
        </ul>

        <h2 className="text-lg font-semibold">2. Sunday Mega Test entry fee</h2>
        <ul className="list-disc pl-5">
          <li>The ₹10 joining fee is non-refundable once the test starts, except in the cases below.</li>
          <li>If fewer than 50 participants join, the entry fee is automatically refunded to your in-app wallet.</li>
          <li>If the test is cancelled or cannot start due to an issue on our side, the entry fee is refunded to your wallet.</li>
          <li>Refunds are not issued for missed tests, network problems on your device, or disqualification for violating the Terms.</li>
        </ul>

        <h2 className="text-lg font-semibold">3. Wallet balance &amp; withdrawals</h2>
        <ul className="list-disc pl-5">
          <li>Wallet credits (refunds, prizes) can be withdrawn to your bank/UPI from the Wallet screen.</li>
          <li>Withdrawal requests are processed after a short review window. Once processed, the balance is deducted from your wallet.</li>
          <li>Provide accurate bank/UPI details. We are not responsible for failed transfers caused by incorrect details submitted by you.</li>
          <li>Wallet balance itself is not directly refundable to the original payment method.</li>
        </ul>

        <h2 className="text-lg font-semibold">4. How to request a refund</h2>
        <p>
          Contact us from the email linked to your account with the transaction ID
          and a short description of the issue. We aim to respond within 5–7 business days.
        </p>

        <h2 className="text-lg font-semibold">5. Changes</h2>
        <p>We may update this policy. Material changes will be communicated in-app.</p>

        <p className="text-xs text-muted-foreground">
          See also: <Link to="/terms" className="underline">Terms &amp; Conditions</Link> ·{" "}
          <Link to="/privacy" className="underline">Privacy Policy</Link>
        </p>
      </section>
    </main>
  );
}
