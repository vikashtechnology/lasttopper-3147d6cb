import type { CapacitorConfig } from "@capacitor/cli";

const publicUrl = (
  process.env.CAPACITOR_SERVER_URL || "https://last-topper-web-test.vercel.app"
).replace(/\/+$/, "");
const publicHost = new URL(publicUrl).hostname;

const config: CapacitorConfig = {
  appId: "com.lasttopper.app",
  appName: "Last Topper",
  webDir: "dist",
  android: {
    minSdkVersion: 26,
    // FLAG_SECURE is added by the Android workflow to block screen capture.
    allowMixedContent: false,
    appendUserAgent: "LastTopperApp",
    overrideUserAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 LastTopperApp",
  },
  server: {
    // The native shell loads the deployed HTTPS build.
    url: publicUrl,
    hostname: publicHost,
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    allowNavigation: [
      publicHost,
      "*.razorpay.com",
      "api.razorpay.com",
      "checkout.razorpay.com",
      "*.supabase.co",
    ],
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_last_topper",
      iconColor: "#4F46E5",
    },
  },
};

export default config;
