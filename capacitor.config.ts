import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lasttopper.app",
  appName: "Last Topper",
  webDir: "dist",
  android: {
    // Prevents screenshots and screen-recording in the native Android app
    // (FLAG_SECURE is set in MainActivity — see ANDROID.md).
    allowMixedContent: false,
    // Google blocks sign-in from user agents that look like an embedded
    // WebView, so present the shell as a normal Chrome browser.
    appendUserAgent: "LastTopperApp",
    overrideUserAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 LastTopperApp",
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
    appendUserAgent: "LastTopperApp",
  },
  server: {
    // The native shell loads the published web build.
    url: "https://lasttopper.lovable.app",
    hostname: "lasttopper.lovable.app",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    // Links to these domains stay inside the app instead of opening a browser:
    // the site itself, Razorpay checkout/UPI, and the backend. Google sign-in
    // is deliberately NOT listed — it must open in the external browser.
    allowNavigation: [
      "lasttopper.lovable.app",
      "*.lovable.app",
      "*.razorpay.com",
      "api.razorpay.com",
      "checkout.razorpay.com",
      "*.supabase.co",
    ],

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
