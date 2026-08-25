# Last Topper

Last Topper is an IIT-JEE and NEET learning platform with quizzes, AI coaching, revision, analytics, community, task-gated Mega Tests, one-time Pro passes, an installable PWA, and direct Android distribution.

The product does not use wallets, deposits, withdrawals, transferable balances, or coin-based entry/rewards. Mega Test access is free and requires fresh completion of every admin-assigned task. The Sunday Mega Test has exactly one prize: final rank #1 receives a 7-day Pro extension.

## Stack

- React 19 and TanStack Start
- TypeScript and Vite
- Tailwind CSS
- Supabase authentication, database, Realtime, and storage
- Capacitor Android shell
- Gemini, OpenRouter, xAI, or a self-hosted OpenAI-compatible AI endpoint
- Razorpay for fixed-duration, one-time Pro passes

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A Supabase project

## Local development

```sh
cp .env.example .env
# Fill only local development values. Never commit .env.
npm install
npm run dev
```

## Validation commands

```sh
npm run format
npm run typecheck
npm run build
npm run lint
```

## Deployment

The public application is deployed as a Node/Nitro application on Vercel. Production variables belong in the Vercel project's Environment Variables settings; changes require a redeployment.

Current public origin:

```text
https://last-topper-web-test.vercel.app
```

The PWA can be installed from a supported browser. Android is distributed directly as a permanently signed APK, accompanied by a source ZIP and checksums in a tagged GitHub Release. Google Play and Apple App Store publication are intentionally out of scope.

For native builds, set the GitHub Actions repository variables `CAPACITOR_SERVER_URL` and `APP_HOST` to the deployed HTTPS origin/host. See [ANDROID.md](./ANDROID.md).

## Environment configuration

- Use `.env.example` as the variable-name reference.
- Never commit populated service-role, AI, payment, callback, messaging, or signing secrets.
- Values beginning with `VITE_` are browser-visible and must never contain privileged credentials.
- Google login credentials are configured in Google Cloud and Supabase Auth, not in this repository.

### Mega Test task provider

Admins can create tasks manually or use **Get Task** to import an external provider catalog. Catalog access is server-only and requires `MEGA_TASK_CATALOG_PROVIDER_ID`, `MEGA_TASK_CATALOG_URL`, and `MEGA_TASK_CATALOG_BEARER_TOKEN`.

The catalog endpoint must be public HTTPS, accept `GET` with a Bearer token, and return either a root array or `{ "tasks": [...] }`. Each task needs an ID (`id`, `task_id`, or `external_id`), a title (`title` or `name`), and an HTTPS URL (`destination_url`, `task_url`, or `url`). Imported tasks are kept inactive unless the same provider also has a trusted callback secret in `MEGA_TASK_PARTNER_SECRETS` (or the single-provider variables). Opening or importing a provider task never marks it complete.

The task-gating migrations and matching application must be deployed together. Validate them first on an isolated staging Supabase project connected only to Vercel Preview. Do not deploy this application against an old schema, and never apply untested task/prize migrations to the production-shared database.
