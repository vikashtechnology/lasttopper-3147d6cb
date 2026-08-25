import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Last Topper" },
      {
        name: "description",
        content:
          "The rules for using Last Topper learning, competition, Mega access tasks, and community features.",
      },
      { property: "og:title", content: "Terms & Conditions — Last Topper" },
      {
        property: "og:description",
        content:
          "The rules for using Last Topper learning, competition, Mega access tasks, and community features.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">Terms &amp; Conditions</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: August 25, 2026</p>

      <section className="prose prose-slate mt-8 max-w-none space-y-6 text-sm leading-6 text-foreground">
        <p>
          These Terms govern your use of Last Topper (the "Service"). By signing in or using the
          Service, you agree to these Terms and our Privacy Policy.
        </p>

        <h2 className="text-lg font-semibold">1. Eligibility</h2>
        <p>You must be at least 13 years old. Users under 18 need parent or guardian consent.</p>

        <h2 className="text-lg font-semibold">2. Your account</h2>
        <ul className="list-disc pl-5">
          <li>Sign in with Google and keep that account secure.</li>
          <li>Provide accurate profile and study-track information.</li>
          <li>
            One account per person. Multi-accounting, automation, or manipulation of task or test
            verification is prohibited.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">3. Learning content and AI</h2>
        <p>
          Questions, hints, and explanations may be generated with AI using NCERT Class 11 and 12
          subject context. Errors may occur. The Service is a study aid and does not guarantee exam
          results or replace official textbooks. Please report incorrect content in the app.
        </p>

        <h2 className="text-lg font-semibold">4. Battles and Sunday Mega Test</h2>
        <ul className="list-disc pl-5">
          <li>Quick Battles, 1v1 Battles, and Sunday Mega Test registration are free.</li>
          <li>Competition outcomes use score, rank, XP, streaks, and recognition.</li>
          <li>
            A Mega Test can be joined only after every active access task assigned to that specific
            test is completed. Registration is unavailable when no task has been assigned.
          </li>
          <li>
            Published schedules, question counts, access tasks, eligibility rules, and
            minimum-participant rules may be updated before the test begins.
          </li>
          <li>
            Cheating, scripts, multi-accounting, question leaks, or unauthorized external help may
            result in disqualification or account suspension.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">5. Mega Test access tasks</h2>
        <ul className="list-disc pl-5">
          <li>
            Access tasks establish eligibility for one specific Mega Test. They do not create value
            that can be reused for another test or exchanged for anything else.
          </li>
          <li>
            Tasks may include qualifying Last Topper study activity, a rewarded video, or an
            admin-published external-partner activity. Availability and configuration may change.
          </li>
          <li>
            Qualifying study activity must be confirmed from Last Topper's authoritative attempt or
            session records after assignment and before the applicable Mega Test begins.
          </li>
          <li>
            Opening a link, waiting for a timer, or receiving a client-side event does not prove
            provider-task completion. A trusted signed callback must verify the completion.
          </li>
          <li>
            Official test ads do not complete an access task. Duplicate, replayed, manipulated,
            incomplete, stale, or unverifiable events are rejected.
          </li>
          <li>
            Each completion must be fresh and linked to its assignment. A study or provider event
            already claimed for one Mega Test cannot unlock another.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">6. One-time Pro passes</h2>
        <ul className="list-disc pl-5">
          <li>Pro is sold as a one-time 7-day, 30-day, or 365-day pass.</li>
          <li>Pro passes are not subscriptions and do not renew automatically.</li>
          <li>
            A successfully verified purchase activates or extends access for the purchased duration.
            Prices and valid discounts are shown before payment.
          </li>
          <li>Refund requests are handled under our Refund Policy and applicable law.</li>
        </ul>

        <h2 className="text-lg font-semibold">7. Community rules</h2>
        <ul className="list-disc pl-5">
          <li>Be respectful. No harassment, hate speech, spam, or sexually explicit content.</li>
          <li>Do not share copyrighted material that you do not have permission to use.</li>
          <li>Do not disclose live test questions or use the community to facilitate cheating.</li>
          <li>Moderators may remove content or restrict accounts that violate these rules.</li>
        </ul>

        <h2 className="text-lg font-semibold">8. App distribution and updates</h2>
        <p>
          The installable web app and Android APK are distributed through our official website, not
          through Google Play or the Apple App Store. Install APK files only from the official Last
          Topper download link and keep the app updated. We are not responsible for modified copies
          obtained elsewhere.
        </p>

        <h2 className="text-lg font-semibold">9. Intellectual property</h2>
        <p>
          The Service, brand, and interface are owned by Last Topper or its licensors. Content you
          post remains yours, but you grant us a non-exclusive license to host and display it as
          needed to operate the Service.
        </p>

        <h2 className="text-lg font-semibold">10. Termination</h2>
        <p>
          We may suspend or terminate accounts that violate these Terms or threaten the Service. You
          may stop using the Service at any time.
        </p>

        <h2 className="text-lg font-semibold">11. Disclaimers and liability</h2>
        <p>
          The Service is provided "as is" to the extent permitted by law. We do not guarantee exam
          results, uninterrupted availability, ad or task availability, or error-free AI content. To
          the maximum extent permitted by law, Last Topper is not liable for indirect, incidental,
          or consequential damages arising from use of the Service.
        </p>

        <h2 className="text-lg font-semibold">12. Changes and governing law</h2>
        <p>
          We may update these Terms and will publish the revised date. These Terms are governed by
          the laws of India, subject to any mandatory rights that apply to you.
        </p>
      </section>
    </main>
  );
}
