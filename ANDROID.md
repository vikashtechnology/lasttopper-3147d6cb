# Building the Android & iOS apps (package: `com.lasttopper.app`)

The web app runs at https://lasttopper.lovable.app. Capacitor wraps that build
into a Play Store / App Store app, adds **FLAG_SECURE** (no screenshots on
Android), **local notifications that fire when the app is closed**, and
**deep links** so any lasttopper.lovable.app link opens in the app if installed.

## 1. One-time setup on your machine

Needs Node.js 20+, Android Studio + Android SDK, JDK 17 (and Xcode 15+ on a Mac for iOS).

```bash
# Export your project to GitHub, git clone it, then:
bun install
bun add @capacitor/cli @capacitor/android @capacitor/ios
bun run build          # produces dist/

npx cap add android
npx cap add ios        # macOS only
npx cap sync
```

`capacitor.config.ts` already sets `appId: "com.lasttopper.app"`, the app name,
the live server URL, and the notification icon/color — don't change the appId
after your first Play Store upload.

## 2. Block screenshots (Android)

`android/app/src/main/java/com/lasttopper/app/MainActivity.java`:

```java
package com.lasttopper.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }
}
```

Screenshots go black, screen recorders capture black frames, and the recents
preview is hidden. iOS has no equivalent flag (Apple doesn't allow it).

## 3. Notifications (already wired in the code)

`@capacitor/local-notifications` is installed and `src/lib/local-notifications.ts`
schedules everything on the device, so these fire **even when the app is closed**:

- 6:30 PM daily "complete your streak"
- motivation nudges at 9:00, 11:30, 14:00, 16:30, 20:30, 22:00
- Mega Test: Saturday 8 PM teaser, Sunday 9:30 AM window open, Sunday 1:30 PM "starts in 30 min"
- live pushes for community threads, study-group messages and personal alerts while the app runs

Permission is requested on first launch after sign-in. Android 13+ needs these
in `android/app/src/main/AndroidManifest.xml` (Capacitor adds them):

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

For iOS, notifications work out of the box; just accept the permission prompt.
On the plain website the same alerts use the browser Notification API, but only
while a tab is open — closed-app delivery is native-only.

> Want server-sent pushes (fire even when the phone never opened the app)?
> That needs Firebase Cloud Messaging / APNs — tell me and I'll add it.

## 4. "Open in app if available" (deep links)

Two files are already served from the web app:

- `public/.well-known/assetlinks.json` — Android App Links
- `public/.well-known/apple-app-site-association` — iOS Universal Links

**Android:** get your release signing fingerprint and paste it in:

```bash
keytool -list -v -keystore my-release-key.jks -alias my-alias | grep SHA256
```

Replace `REPLACE_WITH_YOUR_RELEASE_SHA256_FINGERPRINT` in `assetlinks.json`,
then republish the site. Add the intent filter to `AndroidManifest.xml` inside
the `MainActivity` `<activity>` block:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="lasttopper.lovable.app" />
</intent-filter>
```

**iOS:** replace `REPLACE_TEAMID` with your Apple Team ID, republish, then in
Xcode add the Associated Domains capability with
`applinks:lasttopper.lovable.app`.

After that, tapping any lasttopper.lovable.app link opens the installed app;
if it isn't installed, the browser opens as usual.

## 5. Build & release

```bash
bun run build && npx cap sync

npx cap open android   # Build → Generate Signed Bundle / APK  → upload .aab
npx cap open ios       # Product → Archive → upload to App Store Connect
```

Re-run `bun run build && npx cap sync` after every web change — or skip it,
since the shell loads the live URL and web updates appear instantly.

## 6. Build automatically on GitHub (no local setup)

Two workflows live in `.github/workflows/`:

| File | What it makes | When it runs |
| --- | --- | --- |
| `android.yml` | debug APK, release AAB + APK | push/PR to `main`, tag `v*`, or **Run workflow** |
| `ios.yml` | unsigned `.app` for Xcode signing | tag `v*` or **Run workflow** |

Both generate the `android/` and `ios/` folders with `npx cap add` at build time,
apply FLAG_SECURE, the deep-link intent filter and the notification permissions,
then upload the results as **Actions → workflow run → Artifacts**.

### Getting a Play-Store-signable AAB

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 my-release-key.jks` output |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Create the keystore once with:

```bash
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA \
  -keysize 2048 -validity 10000 -alias lasttopper
```

Without those secrets the release build still runs, but the AAB is unsigned and
Play Console will reject it.

### Releasing

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Download `lasttopper-release` from the run and upload the `.aab` to Play Console.
For iOS, download `lasttopper-ios-unsigned`, open it in Xcode, sign with your
team and Archive → upload.

## 7. Login, referral, share & payment inside the app

- **Logo/icons** — `public/app-icon-1024.png`, `app-icon-512.png`, `app-icon-192.png`,
  `apple-touch-icon.png` and `favicon.png` all come from the Last Topper logo.
  Generate the native launcher icons from `app-icon-1024.png`
  (Android Studio → Image Asset, or Xcode → AppIcon).
- **Google login** — the shell reports a normal Chrome user agent
  (`overrideUserAgent` in `capacitor.config.ts`) so Google doesn't block sign-in
  with `disallowed_useragent`. `accounts.google.com` is in `allowNavigation`, so
  the flow stays inside the app.
- **Referral links** — `https://lasttopper.lovable.app/auth?ref=CODE` opens the
  installed app via App Links / Universal Links. `src/lib/referral-link.ts`
  stores the code (from the URL or the `appUrlOpen` deep-link listener) and the
  onboarding screen prefills it automatically.
- **Sharing** — `src/lib/native-share.ts` uses the native share sheet
  (`@capacitor/share`) on Android/iOS, the Web Share API in mobile browsers, and
  clipboard/download as a fallback. Used by the wallet invite and the scorecard.
- **Payments** — Razorpay checkout runs in-app; `*.razorpay.com`,
  `checkout.razorpay.com` and `api.razorpay.com` are allow-listed. For UPI apps
  to open from checkout, add to `AndroidManifest.xml`:

  ```xml
  <queries>
    <intent>
      <action android:name="android.intent.action.VIEW" />
      <data android:scheme="upi" />
    </intent>
  </queries>
  ```
