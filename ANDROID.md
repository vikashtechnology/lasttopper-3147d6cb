# Building the Android App (with FLAG_SECURE)

The web app runs at https://lasttopper.lovable.app. This wrapper produces a
Play Store–ready Android APK/AAB that adds **FLAG_SECURE** — Android's native
flag that blocks screenshots and screen recording during quizzes and battles.

## One-time setup on your machine

You need Node.js 20+, Android Studio (with an Android SDK), and a JDK 17.

```bash
# 1. Install Capacitor dependencies
bun add @capacitor/core @capacitor/cli @capacitor/android

# 2. Add the Android platform (creates the /android folder)
npx cap add android
```

## Enable FLAG_SECURE in MainActivity

Open `android/app/src/main/java/app/lasttopper/MainActivity.java` and add:

```java
package app.lasttopper;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Block screenshots and screen-recording app-wide.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }
}
```

## Build & run

```bash
# Sync any web-side changes into the native project
npx cap sync android

# Open Android Studio to run on device or build a release AAB
npx cap open android
```

Inside Android Studio: `Build → Generate Signed Bundle / APK` for a release
build ready for the Play Store.

## What FLAG_SECURE does

- Screenshots return black
- Screen recorders capture black frames
- Recent-apps switcher hides the content preview
- App content cannot be mirrored to insecure external displays

It only affects the **native Android build**. In the web browser and PWA the
existing `useAntiCheat` hook still blocks right-click, copy, and DevTools —
that is the strongest protection browsers permit.
