# OAuth and Deep Link Configuration Plan

The user is reporting an "Unsupported provider: missing OAuth secret" error during Google Sign-In and needs confirmation of deep link configurations. Since Lovable Cloud handles the backend but requires user-provided secrets for custom branding, I will verify the existing code and provide instructions for the missing secrets.

## Proposed Changes

### 1. Fix OAuth Error
*   **Problem**: The Playwright test confirms a `400 Bad Request` with `Unsupported provider: missing OAuth secret` when clicking "Continue with Google".
*   **Action**: Instruct the user to add their **Google OAuth Client ID** and **Secret** in the backend view. This is a manual step required for production-ready social auth.
*   **Code Update**: Improve `src/routes/auth.callback.tsx` to display specific error messages if the callback contains an error, helping with future debugging.

### 2. Deep Link & Redirect Verification
*   **Configuration**:
    *   `REDIRECT_URI`: Current code uses `window.location.origin + "/auth/callback"`. This is correct as it dynamically adapts to `lasttopper.lovable.app` or `lasttopper.github.io`.
    *   `FALLBACK_URL`: Supabase redirects to the site root or `auth/callback`. I will ensure `native-auth.ts` correctly handles these transitions.
*   **Scheme**: `lasttopper://app/*` is already mapped in `native-auth.ts`.
*   **GitHub**: `lasttopper.github.io` is listed in `APP_DOMAINS` for App Link support.

### 3. Verification
*   Re-run the Playwright test after the user adds the secrets to confirm the redirect to Google works.

## Technical Details

*   **OAuth Redirects**: Supabase redirects must be configured in the dashboard for `https://lasttopper.lovable.app/auth/callback` and `https://lasttopper.github.io/auth/callback`.
*   **Native Scheme**: The custom URI scheme `lasttopper://` is registered in `manifest.webmanifest`.

## User Instructions
1.  Click **View Backend**.
2.  Go to **Authentication** -> **Sign In Methods** -> **Google**.
3.  Enter your **Client ID** and **Secret** from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
4.  Ensure the Google Cloud Console "Authorized redirect URIs" include: `https://ouaurlfnucmvjmbljmvf.supabase.co/auth/v1/callback`
