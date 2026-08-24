# Last Topper

Last Topper is an IIT-JEE and NEET learning platform with quizzes, AI coaching, revision tools, study analytics, community features, competitive battles, payments, and native Android/iOS packaging.

## Stack

- React 19 and TanStack Start
- TypeScript and Vite
- Tailwind CSS
- Supabase (authentication, database, and storage)
- Capacitor (Android and iOS)
- Configurable AI providers (Gemini, OpenRouter, xAI, or a self-hosted OpenAI-compatible endpoint)

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A Supabase project

## Local development

```sh
cp .env.example .env
# Fill in the required Supabase values in .env
npm install
npm run dev
```

The development server listens on `http://localhost:8080`.

## Commands

```sh
npm run dev       # start the development server
npm run build     # create the production server bundle
npm run preview   # preview the production build
npm run lint      # run ESLint
npm run format    # format the repository
```

## Deployment

The production build uses Nitro and defaults to a Node server. Set `NITRO_PRESET` when deploying to another supported platform.

For native builds, set `CAPACITOR_SERVER_URL` to the deployed HTTPS URL. Configure the same host as the `APP_HOST` GitHub Actions repository variable so Android App Links and iOS Universal Links use your deployment domain.

See [ANDROID.md](./ANDROID.md) for Android-specific instructions.

## Environment configuration

All local secrets belong in `.env`, which is ignored by Git. Use `.env.example` as the configuration reference. Never commit service-role, payment, messaging, or AI-provider keys.
