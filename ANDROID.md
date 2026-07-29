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
