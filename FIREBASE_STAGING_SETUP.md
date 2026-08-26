# Firebase Spark + ImgBB staging setup

This guide creates an isolated Last Topper staging backend. It does not migrate old users or application records and does not change production.

## 1. Create the Firebase staging project

1. Sign in to the [Firebase console](https://console.firebase.google.com/) with an owner-controlled Google account.
2. Choose **Add project** and use a clearly separate name such as `last-topper-staging`.
3. Keep the project on the **Spark** plan. Google Analytics is optional.
4. Record the immutable project ID. Confirm it is not a production project before continuing.
5. Open **Build → Firestore Database → Create database**.
6. Select production mode and a nearby region after reviewing data-residency needs. The database location is difficult to change later.
7. Do not enable Cloud Functions or Firebase Storage. This application uses Vercel server routes and ImgBB.

### Add the web app

1. Open **Project settings → General → Your apps → Web**.
2. Register `Last Topper Staging Web`; Firebase Hosting is not required.
3. Copy the SDK configuration into the matching `VITE_FIREBASE_*` variables in `.env` and Vercel Preview.
4. Set both `FIREBASE_PROJECT_ID` and `VITE_FIREBASE_PROJECT_ID` to the same staging project ID.

The browser Firebase configuration and its API key identify the Firebase app; they are not Admin credentials. Security still depends on Auth, server authorization, and Firestore rules.

## 2. Configure Google-only Firebase Authentication

1. Open **Build → Authentication → Get started → Sign-in method**.
2. Enable **Google** and choose the owner-controlled project support email.
3. Leave every other provider disabled. The public UI must show only **Continue with Google**.
4. Under **Authentication → Settings → Authorized domains**, add the stable Vercel staging hostname without `https://`.
5. Keep the default `<project-id>.firebaseapp.com` domain.

Use a stable staging domain or Vercel branch domain. A one-off Vercel deployment hostname may change and then fail Firebase's authorized-domain check.

For Google Auth Platform consent settings, use the minimum `openid`, email, and profile scopes. While the consent screen is in testing, add only approved staging testers. Firebase manages the web Google sign-in client; do not add an application `/auth/callback` URL.

## 3. Create server-only Firebase Admin credentials

1. Open **Project settings → Service accounts**.
2. Choose **Generate new private key** and download the JSON once.
3. Store it in an owner password manager. Never commit or place it in a `VITE_*` variable.
4. Set `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel **Preview** to either the compact raw JSON or its base64 representation.
5. Alternatively set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`; the single JSON value is easier and less error-prone.

To base64-encode without line breaks:

```sh
base64 -w 0 last-topper-staging-service-account.json
```

On macOS:

```sh
base64 < last-topper-staging-service-account.json | tr -d '\n'
```

Delete unneeded downloaded copies after the value is safely stored. Rotate the key if it is exposed.

## 4. Deploy deny-all Firestore rules and indexes

Install dependencies and authenticate the Firebase CLI with the owner-controlled account:

```sh
npm ci
npx firebase-tools login
npx firebase-tools use --add
# Choose the staging project and alias it "staging".
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR-STAGING-PROJECT-ID
```

`firestore.rules` denies all direct browser/mobile reads and writes. Firebase Admin bypasses those rules, so server handlers must continue enforcing role, ownership, membership, visibility, and callback authorization explicitly.

Do not weaken the rules merely to make browser requests work. Application data access belongs behind authenticated TanStack Start/Vercel server routes.

## 5. Configure ImgBB

1. Obtain an API key from [ImgBB API](https://api.imgbb.com/).
2. Set `IMGBB_API_KEY` in Vercel Preview only.
3. Do not expose this key in a `VITE_*` value or client request.
4. The authenticated `/api/images/upload` route enforces image validation and calls ImgBB with `expiration=604800` (seven days).

ImgBB links are possession-based public URLs until expiry; do not upload private identity documents or secrets.

## 6. Populate Vercel Preview variables

Open **Vercel → Last Topper project → Settings → Environment Variables** and add the staging values in **Preview** scope. Use `.env.example` as the authoritative list.

Minimum backend/auth/image variables:

```dotenv
VITE_PUBLIC_APP_URL=https://YOUR-STABLE-STAGING-HOST
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=YOUR-STAGING-PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR-STAGING-PROJECT-ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR-STAGING-PROJECT.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
FIREBASE_PROJECT_ID=YOUR-STAGING-PROJECT-ID
FIREBASE_SERVICE_ACCOUNT_JSON=
IMGBB_API_KEY=
INTERNAL_HOOK_SECRET=
```

Also configure at least one supported AI provider for generated content. Use Razorpay Test Mode only if staging paid Pro passes. Keep `ADMOB_TASKS_ENABLED=false` until a real app/unit and signed SSV flow pass.

After changing Vercel variables, redeploy the Preview. Environment changes do not alter an already-built deployment.

## 7. Configure the five-minute lifecycle

The repository workflow `.github/workflows/mega-test-lifecycle.yml` uses:

- repository variable `MEGA_LIFECYCLE_URL`; and
- repository secret `INTERNAL_HOOK_SECRET`.

Set them in **GitHub repository → Settings → Secrets and variables → Actions**:

```text
MEGA_LIFECYCLE_URL=https://YOUR-STABLE-STAGING-HOST/api/public/hooks/mega-test-lifecycle
INTERNAL_HOOK_SECRET=<the exact same value used by Vercel Preview>
```

Generate a strong value locally:

```sh
openssl rand -base64 48
```

The workflow sends authenticated POST requests every five minutes and can be run manually. GitHub Actions scheduling is best effort and may be delayed. Authenticated application requests also trigger throttled recovery. A four-minute Firestore lease prevents overlapping lifecycle workers.

Never put the secret in the URL and never expose the endpoint as an unauthenticated GET.

## 8. Firebase Android app and native Google login

1. In Firebase **Project settings → Your apps**, add an Android app with package `com.lasttopper.app`.
2. Add the SHA-1 and SHA-256 fingerprints for the debug certificate used in staging and the permanent release certificate used for release builds.
3. Download that staging Android app's `google-services.json`.
4. Base64-encode it and store it as GitHub Actions secret `FIREBASE_GOOGLE_SERVICES_JSON_BASE64`.
5. Never substitute a config from a different package or Firebase project.

The Android workflow writes this file only inside the generated `android/` build directory. Tagged/manual release builds fail when it is missing. The file is Firebase client configuration rather than an Admin key, but keeping the project-specific build config in Actions avoids accidental cross-environment builds.

For a local generated Android project, copy it to `android/app/google-services.json` before `npx cap sync android`.

## 9. Local validation

Use Node 22 and JDK 21 or newer:

```sh
java -version
node --version
npm ci
npm run format
npm run lint
npm run typecheck
npm run build
npm run test:firebase
```

The emulator suite uses `demo-last-topper` and must report all tests passing. It validates deny-all client rules, Admin isolation, profile bootstrap with non-UUID Firebase UIDs, community transactions, required fresh Mega tasks, and rank-one-only Pro awarding.

## 10. Staging acceptance gate

Do not configure or promote production until all checks pass:

### Authentication and access

- only **Continue with Google** appears;
- web and a physical Android device can sign in and sign out;
- first sign-in creates one profile and retries do not duplicate it;
- a normal user cannot access admin actions;
- Admin credentials and ImgBB keys are absent from browser bundles and requests.

### Firestore and community

- direct client Firestore reads and writes fail;
- server profile, quiz, review, community, group, and follow flows work;
- private group data is not visible to nonmembers;
- counters, votes, accepted answers, membership, XP, and fulfillment remain idempotent/atomic.

### Mega Tests

- a test with zero assigned tasks cannot register students;
- all assigned tasks are required and completion is fresh for that test;
- clicks, timers, client events, unsigned callbacks, stale signatures, wrong nonces, and replayed transactions fail;
- lifecycle overlap/retry does not duplicate tests, ranks, notifications, or Pro time;
- final rank #1 receives exactly seven Pro days; every lower rank receives no prize.

### Images, payments, PWA, and Android

- upload accepts an authenticated valid image and rejects unauthorized/invalid input;
- the returned ImgBB delete time is seven days;
- each Razorpay Test purchase grants ₹49/7, ₹149/30, or ₹1,499/365 once;
- PWA install/offline shell and supported notifications work;
- signed APK certificate matches `public/.well-known/assetlinks.json`;
- HTTPS App Links open the APK and fall back to the website when it is absent.

Record the tested Git commit, Firebase staging project ID, Preview URL, test results, and any known limitations.

## 11. Production gate

Production remains unchanged until the owner explicitly approves promotion after staging. On approval, create or configure separate production Firebase web/Android apps and credentials, deploy the reviewed rules, set production-only Vercel/GitHub values, and rerun smoke tests against the exact approved commit.

Never reuse staging service-account JSON, scheduler secret, Razorpay Test credentials, or provider callback secrets in production. No previous users or application records are imported by this migration.
