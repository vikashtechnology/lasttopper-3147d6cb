# Last Topper

Last Topper is an IIT-JEE and NEET learning platform with quizzes, AI coaching, revision, analytics, community, task-gated Mega Tests, one-time Pro passes, an installable PWA, and direct Android distribution.

The product has no wallet, deposits, withdrawals, transferable balances, coin history, or coin-based entry/rewards. Mega Test access requires fresh completion of every admin-assigned task. The Sunday Mega Test has one prize only: final rank #1 receives a 7-day Pro extension.

## Stack

- React 19, TanStack Start, TypeScript, Vite, and Tailwind CSS
- Firebase Authentication (Google only)
- Cloud Firestore, accessed by Firebase Admin in the existing Vercel server routes
- ImgBB server-side uploads with automatic deletion after seven days
- Capacitor Android shell
- GitHub Actions plus request recovery for the best-effort five-minute Mega lifecycle
- Gemini, OpenRouter, xAI, or an OpenAI-compatible endpoint
- Razorpay one-time Pro passes

Firebase Cloud Functions and Firebase Storage are intentionally not used, so the backend can remain on the Firebase Spark plan. Firestore client rules deny all direct reads and writes; authorization is enforced by server routes.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- JDK 21 or newer for Firebase emulator and Android validation
- A new, separate Firebase staging project on Spark
- An ImgBB API key

## Local development

```sh
cp .env.example .env
# Fill staging values only. Never commit .env.
npm install
npm run dev
```

Use a service-account JSON value for local Firebase Admin access. The browser values beginning with `VITE_FIREBASE_` are public Firebase app configuration, not Admin credentials.

## Validation

```sh
npm run format
npm run lint
npm run typecheck
npm run build
npm run test:firebase
```

`npm run test:firebase` starts the Firestore emulator and requires JDK 21+. The test project ID is `demo-last-topper`; it does not contact production.

## Staging setup and deployment

Follow [FIREBASE_STAGING_SETUP.md](./FIREBASE_STAGING_SETUP.md). The release sequence is strictly:

1. create an isolated Firebase staging project;
2. configure a Vercel Preview with staging-only variables;
3. deploy Firestore rules/indexes and validate the Preview;
4. run the complete staging acceptance checklist;
5. request explicit production approval;
6. only then prepare a separate production configuration.

Production must not be changed during staging. This migration starts with no imported users or application records.

## Environment configuration

- `.env.example` is the authoritative variable-name template.
- Never commit populated Admin, ImgBB, AI, payment, callback, messaging, or signing secrets.
- `VITE_*` values are included in browser bundles and must never contain privileged credentials.
- Use `FIREBASE_SERVICE_ACCOUNT_JSON` or the split Admin fields, never both unless their values match.
- GitHub scheduler variable `MEGA_LIFECYCLE_URL` targets `/api/public/hooks/mega-test-lifecycle`; its GitHub `INTERNAL_HOOK_SECRET` must equal the Vercel secret.

## Task-provider security

Admins may create study tasks manually or import provider tasks with **Get Task**. A provider catalog must use HTTPS and server-only Bearer authentication. External completion counts only after a trusted signed callback; clicks, timers, redirects, client events, and test ads never count.

Imported provider tasks remain inactive unless matching callback credentials are configured. A Mega Test with no assigned tasks remains locked, and all assigned tasks must be freshly completed for that specific test.

## Distribution

The website is an installable PWA. Android is distributed only as a signed APK with a source ZIP and checksums from a tagged GitHub Release. Google Play and Apple App Store publication are out of scope. See [ANDROID.md](./ANDROID.md).
