# Last Topper Android build and direct distribution

Last Topper uses Capacitor with package ID `com.lasttopper.app`. The native shell loads the configured HTTPS deployment and adds native Firebase Google sign-in, screenshot protection, App Links, local notifications, sharing, and Razorpay-compatible navigation.

Google Play and Apple App Store publication are not part of this project. Students receive a signed APK directly from a tagged GitHub Release; the website remains an installable PWA and web fallback.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- Android SDK
- JDK 21 or newer
- Firebase Android app registered as `com.lasttopper.app`
- that app's `google-services.json`

The GitHub workflow generates `android/` at build time, so the directory is not committed.

## Firebase native Google sign-in

In the same isolated Firebase staging project used by the Preview:

1. Open **Project settings → Your apps → Add Android app**.
2. Use package name `com.lasttopper.app`.
3. Add staging debug and permanent release SHA-1/SHA-256 certificate fingerprints.
4. Download `google-services.json`.
5. Base64-encode it without line breaks and add GitHub Actions secret:

```text
FIREBASE_GOOGLE_SERVICES_JSON_BASE64
```

For a local generated project, copy the file to `android/app/google-services.json` before synchronization. Tagged/manual release builds intentionally fail without the Actions secret.

Authentication must remain Google-only. The native plugin obtains a Firebase ID token and the Vercel server verifies it with Firebase Admin. No browser callback, phone login, email link, or password login is used.

## Deployment origin

`capacitor.config.ts` reads `CAPACITOR_SERVER_URL` and defaults to the current web origin. Configure staging first with a stable Preview/branch domain.

GitHub Actions repository variables:

```text
APP_HOST=YOUR-STAGING-HOST.vercel.app
CAPACITOR_SERVER_URL=https://YOUR-STAGING-HOST.vercel.app
ADMOB_ANDROID_APP_ID=<real AdMob app ID; omit until approved>
APP_VERSION_NAME=1.0.1
APP_VERSION_CODE=<increasing positive integer>
```

`VITE_PUBLIC_APP_URL` in Vercel must use the same origin. App Links use only the host, without `https://`.

## Local Android project

```sh
npm ci
npm run build
npx cap add android
cp /secure/path/google-services.json android/app/google-services.json
npx cap sync android
npx cap open android
```

Run a physical-device sign-in test. A successful web sign-in alone does not validate native Firebase configuration, certificate fingerprints, or `google-services.json`.

## Native security

The Android workflow:

- sets minimum SDK 26;
- uses `FLAG_SECURE` to block screenshots, recording, and recent-app previews;
- refuses cleartext HTTP;
- adds verified HTTPS App Links and `lasttopper://` fallback schemes;
- installs the Firebase Android configuration for release builds;
- configures the selected AdMob Android application ID;
- adds notification permissions.

The Capacitor navigation allowlist includes only the deployed application host and required Razorpay hosts.

## App Links and web fallback

The public Android association file is:

```text
public/.well-known/assetlinks.json
```

Its package must be `com.lasttopper.app`, and its SHA-256 fingerprint must match the permanent release certificate. The tagged release workflow fails if the signed APK certificate and association file differ.

Configure:

```text
APP_HOST=YOUR-PUBLIC-HOST
CAPACITOR_SERVER_URL=https://YOUR-PUBLIC-HOST
```

Then verify on a device:

```sh
adb shell pm verify-app-links --re-verify com.lasttopper.app
adb shell pm get-app-links com.lasttopper.app
```

Opening an HTTPS route should open the app when installed and the website when absent.

## Local notifications

The installed Android application schedules:

- a daily 6:30 PM streak reminder;
- daytime motivation reminders;
- Saturday evening and Sunday morning Mega Test reminders.

The workflow adds:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

Users can select **Test device** on the in-app Notifications page. If exact alarms are disabled, delivery may be less precise. Website/PWA browser alerts work only while the site is open and permission is granted. Closed-app remote push is not implemented and must not be advertised.

A real Android-device test is required before calling notification or login behavior production-verified.

## Permanent signing

Create one release keystore and preserve it permanently:

```sh
keytool -genkeypair -v \
  -keystore last-topper-release.jks \
  -alias lasttopper \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

GitHub Actions repository secrets:

```text
FIREBASE_GOOGLE_SERVICES_JSON_BASE64
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Never commit the keystore, Firebase Admin credentials, or signing passwords. Add the release keystore's SHA-1/SHA-256 fingerprints to the Firebase Android app and use the same key for every future APK update.

## Release flow

1. Complete isolated Firebase/Vercel staging validation.
2. Obtain explicit production approval.
3. Deploy and smoke-test the matching production website/backend.
4. Increase `APP_VERSION_CODE`.
5. Confirm `APP_VERSION_NAME` or the intended `v*` tag.
6. Confirm the release certificate exists in Firebase Android settings and `assetlinks.json`.
7. Push an approved tag, for example `v1.0.1`.
8. GitHub Actions builds and verifies the signed APK.
9. The GitHub Release contains `last-topper.apk`, `last-topper-source.zip`, and `SHA256SUMS.txt`.
10. Publish the stable APK URL through the Last Topper admin app-update page.

The same release key is required for every future update.
