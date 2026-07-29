import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lasttopper.app",
  appName: "Last Topper",
  webDir: "dist",
  android: {
    // Prevents screenshots and screen-recording in the native Android app
    // (FLAG_SECURE is set in MainActivity — see ANDROID.md).
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
  },
  server: {
    // The native shell loads the published web build.
    url: "https://lasttopper.lovable.app",
    hostname: "lasttopper.lovable.app",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    // Links to these domains stay inside the app instead of opening a browser.
    allowNavigation: ["lasttopper.lovable.app", "*.lovable.app", "*.razorpay.com", "*.supabase.co"],
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#4F46E5",
      sound: "beep.wav",
    },
  },
};

export default config;
