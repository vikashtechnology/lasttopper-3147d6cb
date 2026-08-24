# Native Android and iOS builds

Last Topper uses Capacitor with package ID `com.lasttopper.app`. The native shell loads an independently deployed HTTPS build and adds Android screenshot protection, local notifications, native sharing, payments, and deep links.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- Android Studio, Android SDK, and JDK 21 for Android
- Xcode 15 or newer and CocoaPods for iOS

Install dependencies and build the web application:

```bash
npm ci
npm run build
```

The native platform packages are development dependencies. The workflows invoke pinned Capacitor CLI and asset-generator versions through `npx`.

## Deployment URL

`capacitor.config.ts` reads the public deployment from `CAPACITOR_SERVER_URL` and defaults to:

```text
https://last-topper-web-test.vercel.app
```

Set both variables when using another deployment host:

```bash
export CAPACITOR_SERVER_URL=https://app.example.com
export APP_HOST=app.example.com
```

Set `VITE_PUBLIC_APP_URL` to the same public URL when building the web app. Do not include a trailing slash.

For GitHub Actions, create repository variables named `CAPACITOR_SERVER_URL` and `APP_HOST`. The Android and iOS workflows use the independent GitHub Pages host by default.

## Create and sync native projects

```bash
npx cap add android
npx cap add ios       # macOS only
npx cap sync
```

Open the generated projects with:

```bash
npx cap open android
npx cap open ios
```

The workflows generate `android/` and `ios/` at build time, so those directories do not need to be committed.

## Android screenshot protection

The Android workflow writes `MainActivity.java` with `FLAG_SECURE`. This blocks screenshots, screen recordings, and the recent-app preview:

```java
getWindow().setFlags(
    WindowManager.LayoutParams.FLAG_SECURE,
    WindowManager.LayoutParams.FLAG_SECURE
);
```

iOS does not provide an equivalent system flag.

## Local notifications

`src/lib/local-notifications.ts` schedules reminders on the device through `@capacitor/local-notifications`. Android requires:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

The Android workflow adds both permissions. Remote notifications that arrive without the app scheduling them require a separate FCM/APNs integration.

## Deep links and OAuth

The app supports:

- HTTPS App Links and Universal Links on `APP_HOST`
- `lasttopper://app/...` for application routes
- `lasttopper://auth/callback` for the native OAuth return

Public association files are stored at:

- `public/.well-known/assetlinks.json`
- `public/.well-known/apple-app-site-association`

Serve these files directly from the root of `APP_HOST`, without redirects. Replace the Apple placeholder in `apple-app-site-association` with the production Apple Team ID. Keep the Android certificate fingerprints in `assetlinks.json` synchronized with the Play signing certificate.

Google sign-in opens in the device's external browser. Configure Supabase Authentication to allow this redirect URL:

```text
https://APP_HOST/auth/callback?native_app=1
```

Also configure the web callback URL without the query marker. After Supabase completes sign-in, the callback page returns the session to the installed app through the custom URL scheme when necessary.

## Payments

The Capacitor configuration permits the configured deployment host, Supabase, and Razorpay checkout hosts. To let Razorpay open installed UPI applications, add this to `AndroidManifest.xml`:

```xml
<queries>
  <intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="upi" />
  </intent>
</queries>
```

## GitHub Actions builds

| Workflow                        | Output                         | Trigger                                    |
| ------------------------------- | ------------------------------ | ------------------------------------------ |
| `.github/workflows/android.yml` | Debug APK; release AAB and APK | Push/PR to `main`, `v*` tag, or manual run |
| `.github/workflows/ios.yml`     | Unsigned iOS `.app`            | `v*` tag or manual run                     |

The Android release can be signed with these repository secrets:

| Secret                      | Value                           |
| --------------------------- | ------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password               |
| `ANDROID_KEY_ALIAS`         | Key alias                       |
| `ANDROID_KEY_PASSWORD`      | Key password                    |

Create a keystore once:

```bash
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA \
  -keysize 2048 -validity 10000 -alias lasttopper
```

Then encode it on Linux:

```bash
base64 -w0 my-release-key.jks
```

Before each release, increment `APP_VERSION_CODE` and update `APP_VERSION_NAME` in the Android workflow. Trigger a tagged build with:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Download the resulting artifacts from the GitHub Actions run. The unsigned iOS artifact must be opened, signed, and archived with an Apple Developer team before App Store submission.
