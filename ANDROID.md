# Last Topper Android build and direct distribution

Last Topper uses Capacitor with package ID `com.lasttopper.app`. The native Android shell loads the deployed HTTPS application and adds screenshot protection, App Links, local notifications, native sharing, and Razorpay-compatible navigation.

Google Play and Apple App Store publication are not part of this project. Students receive a signed APK directly from a tagged GitHub Release; the website remains an installable PWA and web fallback.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- Android SDK and JDK 21 for local Android builds

```bash
npm ci
npm run build
```

The GitHub workflow generates the Android project at build time, so `android/` is not committed.

## Deployment origin

`capacitor.config.ts` reads `CAPACITOR_SERVER_URL` and defaults to:

```text
https://last-topper-web-test.vercel.app
```

GitHub Actions repository Variables:

```text
APP_HOST=last-topper-web-test.vercel.app
CAPACITOR_SERVER_URL=https://last-topper-web-test.vercel.app
ADMOB_ANDROID_APP_ID=<real AdMob app ID; omit until approved>
APP_VERSION_NAME=1.0.1
APP_VERSION_CODE=<increasing positive integer>
```

`VITE_PUBLIC_APP_URL` belongs in Vercel and must use the same public origin.

## Local Android project

```bash
npx cap add android
npx cap sync android
npx cap open android
```

## Native security

The Android workflow:

- sets minimum SDK 26;
- writes `MainActivity.java` with `FLAG_SECURE` to block screenshots, recording, and the recent-app preview;
- refuses cleartext HTTP;
- adds verified HTTPS App Links and the `lasttopper://` fallback schemes;
- configures the selected AdMob Android application ID;
- adds notification permissions.

## Local notifications

The installed Android application uses `@capacitor/local-notifications` for device-side reminders. It schedules:

- a daily 6:30 PM streak reminder;
- daytime motivation reminders;
- Saturday evening and Sunday morning Mega Test reminders.

Android permissions added by the build:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

Users can open the in-app **Notifications** page and select **Test device**. This requests permission from a user gesture, sends an immediate test, and reschedules native reminders.

On the website/PWA, immediate browser alerts work only while Last Topper is open and permission has been granted. Closed-app remote notifications require a future FCM integration; local native reminders do not require FCM.

A real Android-device test remains required before calling the APK notification behavior production-verified.

## Google login and App Links

The app uses Supabase's browser-based Google OAuth flow. Configure:

```text
Google authorized origin:
https://last-topper-web-test.vercel.app

Google authorized redirect URI:
https://hcqlwtmeylnhqernwljj.supabase.co/auth/v1/callback

Supabase redirect allowlist:
https://last-topper-web-test.vercel.app/auth/callback
```

The public Android association file is:

```text
public/.well-known/assetlinks.json
```

Its package name must be `com.lasttopper.app`, and its SHA-256 fingerprint must match the permanent release certificate. The tagged release workflow fails if the signed APK certificate and `assetlinks.json` do not match.

## Permanent signing

Create one release keystore and preserve it permanently:

```bash
keytool -genkeypair -v \
  -keystore last-topper-release.jks \
  -alias lasttopper \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

GitHub Actions repository Secrets:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Never commit the keystore or passwords. Tagged builds refuse to publish without signing secrets.

## Release flow

1. Deploy and validate the matching website/database release.
2. Increase `APP_VERSION_CODE`.
3. Confirm `APP_VERSION_NAME` or use the intended `v*` tag.
4. Confirm `assetlinks.json` contains the permanent certificate fingerprint.
5. Push an approved tag, for example `v1.0.1`.
6. GitHub Actions builds and verifies the signed APK.
7. The GitHub Release contains:
   - `last-topper.apk`
   - `last-topper-source.zip`
   - `SHA256SUMS.txt`
8. Publish the stable APK URL from the Last Topper admin app-update page.

The same release key must be used for every future APK update.
