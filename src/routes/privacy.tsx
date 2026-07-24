import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Last Topper" },
      { name: "description", content: "How Last Topper collects, uses, and protects your data." },
      { property: "og:title", content: "Privacy Policy — Last Topper" },
      { property: "og:description", content: "How Last Topper collects, uses, and protects your data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">← Home</Link>
      <h1 className="mt-4 text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: July 24, 2026</p>

      <section className="prose prose-slate mt-8 max-w-none space-y-6 text-sm leading-6 text-foreground">
        <p>
          This Privacy Policy explains how Last Topper ("we", "us") collects, uses, and shares
          information when you use our JEE/NEET practice app, quizzes, battles, wallet, and
          community features (the "Service"). This page is maintained by the app owner.
        </p>

        <h2 className="text-lg font-semibold">1. Information we collect</h2>
        <ul className="list-disc pl-5">
          <li><strong>Account info:</strong> name, email, avatar, and phone number you provide during Google sign-in and onboarding.</li>
          <li><strong>Profile info:</strong> profession (PCM/PCB), bio, and preferences.</li>
          <li><strong>Learning data:</strong> chapters selected, quiz sessions, answers, timing, scores, streaks, and mistakes.</li>
          <li><strong>Community content:</strong> posts, doubts, replies, group messages, uploaded images, votes, and reports.</li>
          <li><strong>Wallet data:</strong> mock in-app balance, transactions, and withdrawal details (UPI ID or bank details you submit).</li>
          <li><strong>Device/usage:</strong> basic technical logs required to operate the Service.</li>
        </ul>

        <h2 className="text-lg font-semibold">2. How we use information</h2>
        <ul className="list-disc pl-5">
          <li>Provide personalized questions, adaptive practice, results, and mistake bank.</li>
          <li>Run Quick Battles, Sunday Mega Test, leaderboards, and community features.</li>
          <li>Process withdrawal requests and maintain wallet history.</li>
          <li>Send in-app notifications and operational updates.</li>
          <li>Prevent fraud, cheating, abuse, and enforce our Terms.</li>
        </ul>

        <h2 className="text-lg font-semibold">3. AI question generation</h2>
        <p>
          Quiz questions are generated using AI models restricted to NCERT Class 11 & 12
          content. Your chapter selections and profession are sent to the AI provider to
          produce questions. We do not send your name, email, or contact details.
        </p>

        <h2 className="text-lg font-semibold">4. Sharing</h2>
        <p>We do not sell personal data. We share limited information with:</p>
        <ul className="list-disc pl-5">
          <li>Auth and database infrastructure providers that run the Service.</li>
          <li>AI providers used only to generate questions.</li>
          <li>Our admin team via internal messaging channels for operational alerts (e.g., withdrawal requests).</li>
          <li>Law enforcement when legally required.</li>
        </ul>

        <h2 className="text-lg font-semibold">5. Public content</h2>
        <p>
          Profiles, forum posts, doubts, replies, and leaderboard entries are visible to
          other signed-in users. Do not post personal or sensitive information publicly.
        </p>

        <h2 className="text-lg font-semibold">6. Data retention</h2>
        <p>
          We retain account and learning data while your account is active. Generated
          question caches expire after 24 hours. You may request deletion of your account
          by contacting support.
        </p>

        <h2 className="text-lg font-semibold">7. Security</h2>
        <p>
          We use industry-standard authentication, row-level security, and encrypted
          connections. No system is 100% secure; please use a strong Google account.
        </p>

        <h2 className="text-lg font-semibold">8. Children</h2>
        <p>
          The Service is intended for students preparing for JEE/NEET. Users under 13 must
          use the app under a parent or guardian's supervision.
        </p>

        <h2 className="text-lg font-semibold">9. Changes</h2>
        <p>We may update this policy. Continued use after changes means you accept the update.</p>

        <h2 className="text-lg font-semibold">10. Contact</h2>
        <p>Questions? Contact the Last Topper team through the in-app support option.</p>
      </section>
    </main>
  );
}
