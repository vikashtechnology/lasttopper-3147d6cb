import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Last Topper" },
      { name: "description", content: "How Last Topper collects, uses, and protects your data." },
      { property: "og:title", content: "Privacy Policy — Last Topper" },
      {
        property: "og:description",
        content: "How Last Topper collects, uses, and protects your data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: August 25, 2026</p>

      <section className="prose prose-slate mt-8 max-w-none space-y-6 text-sm leading-6 text-foreground">
        <p>
          This Privacy Policy explains how Last Topper ("we" or "us") handles information when you
          use our JEE/NEET learning, competition, Mega Test access-task, and community features (the
          "Service").
        </p>

        <h2 className="text-lg font-semibold">1. Information we collect</h2>
        <ul className="list-disc pl-5">
          <li>
            <strong>Account information:</strong> name, email, avatar, Google account identifier,
            and authentication records supplied through Google sign-in.
          </li>
          <li>
            <strong>Profile information:</strong> date of birth, study track, bio, preferences, and
            other information you choose to provide.
          </li>
          <li>
            <strong>Learning information:</strong> selected chapters, questions, answers, timing,
            scores, streaks, mistakes, mastery, and quiz history.
          </li>
          <li>
            <strong>Community content:</strong> posts, doubts, replies, group messages, images,
            votes, reports, and moderation records.
          </li>
          <li>
            <strong>Mega Test access information:</strong> task assignments, attempt status,
            provider transaction identifiers, signed-verification data, authoritative study-source
            claims, timestamps, and anti-replay records.
          </li>
          <li>
            <strong>Payment information:</strong> order, payment, plan, amount, discount, and
            fulfillment identifiers for Pro purchases. Payment-card or bank credentials are handled
            by the payment provider and are not stored by us.
          </li>
          <li>
            <strong>Device and usage information:</strong> app version, platform, timestamps, basic
            diagnostics, security logs, IP-derived information, and similar data needed to operate
            and protect the Service.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">2. How we use information</h2>
        <ul className="list-disc pl-5">
          <li>Authenticate accounts and provide personalized learning features.</li>
          <li>Run battles, free Sunday Mega Tests, leaderboards, and community features.</li>
          <li>
            Verify per-test access-task completion and prevent duplicate, replayed, stale, or
            fraudulent claims.
          </li>
          <li>Process and fulfill one-time Pro-pass payments.</li>
          <li>Send service, security, moderation, and in-app notifications.</li>
          <li>Diagnose problems, enforce our Terms, and improve safety and reliability.</li>
        </ul>

        <h2 className="text-lg font-semibold">3. AI processing</h2>
        <p>
          We may send subject, chapter, profession, and learning context to AI providers to generate
          or explain educational content. We do not intentionally include your email, contact
          details, payment data, or task-provider identifiers in AI prompts.
        </p>

        <h2 className="text-lg font-semibold">4. Mega Test provider tasks</h2>
        <p>
          When rewarded-video access tasks are enabled, our advertising provider may process device
          identifiers, IP address, app information, ad interactions, fraud signals, and consent
          choices under its own privacy terms. To verify task completion, the provider sends us a
          signed callback containing a provider transaction ID, ad placement, timestamp, and
          pseudonymous attempt or user correlation data. Official test ads do not complete tasks.
        </p>
        <p>
          If you choose an external-link task, the destination is operated by a third party. That
          partner may process information under its own policy and may send us a signed completion
          callback containing a transaction ID and pseudonymous attempt correlation data. Review the
          destination's terms and privacy notice before participating.
        </p>

        <h2 className="text-lg font-semibold">5. Sharing</h2>
        <p>We do not sell personal data. We share limited information as needed with:</p>
        <ul className="list-disc pl-5">
          <li>Google sign-in, hosting, database, and infrastructure providers.</li>
          <li>AI providers used to generate educational content.</li>
          <li>Our payment provider for one-time Pro purchases.</li>
          <li>Advertising and task partners when you choose to use those features.</li>
          <li>
            Service administrators and authorities where reasonably necessary or legally required.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">6. Public content</h2>
        <p>
          Profiles, forum posts, doubts, replies, and leaderboard entries may be visible to other
          users. Do not publish personal, financial, or sensitive information in public areas.
        </p>

        <h2 className="text-lg font-semibold">7. Retention and deletion</h2>
        <p>
          We retain information for as long as needed to provide the Service, meet legal
          obligations, resolve disputes, prevent fraud, and enforce agreements. Security, payment,
          task-verification, provider-transaction, and anti-replay records may be kept after account
          deletion where necessary. You may request account deletion through support.
        </p>

        <h2 className="text-lg font-semibold">8. Security</h2>
        <p>
          We use authentication, encrypted connections, access controls, row-level database
          security, signed provider callbacks, and replay protection. No system is completely
          secure, so keep your Google account and device protected.
        </p>

        <h2 className="text-lg font-semibold">9. Children</h2>
        <p>
          The Service is intended for users aged 13 and older. Users under 18 should use it with
          parent or guardian consent. Do not use the Service if you are under 13.
        </p>

        <h2 className="text-lg font-semibold">10. Changes and contact</h2>
        <p>
          We may update this policy and will publish the revised date. For privacy questions or an
          account-deletion request, contact the Last Topper team through the in-app support option.
        </p>
      </section>
    </main>
  );
}
