import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lasttopper",
  appName: "Last Topper",
  webDir: "dist",
  android: {
    // Prevents screenshots and screen-recording in the native Android app.
    // Requires the capacitor-flag-secure plugin to be installed & synced.
    // The plugin reads this hint from a native FLAG_SECURE flag we set in MainActivity.
    allowMixedContent: false,
  },
  server: {
    // Use published web build inside the wrapper. Change to your custom domain if needed.
    url: "https://lasttopper.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
};

export default config;
