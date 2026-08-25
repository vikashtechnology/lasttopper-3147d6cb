import { isNativeApp } from "@/lib/native-auth";

let initialized = false;

async function initializeAdMob() {
  const { AdMob, MaxAdContentRating } = await import("@capacitor-community/admob");
  if (!initialized) {
    await AdMob.initialize({
      initializeForTesting: false,
      testingDevices: [],
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
      maxAdContentRating: MaxAdContentRating.General,
    });
    initialized = true;
  }
  return AdMob;
}

export async function showVerifiedRewardedAd(args: {
  adUnitId: string;
  userId: string;
  attemptId: string;
  nonce: string;
}) {
  if (!(await isNativeApp()))
    throw new Error("Rewarded videos are available in the Android app only");
  const AdMob = await initializeAdMob();
  await AdMob.prepareRewardVideoAd({
    adId: args.adUnitId,
    isTesting: false,
    npa: true,
    ssv: {
      userId: args.userId,
      customData: `${args.attemptId}.${args.nonce}`,
    },
  });
  // This return value is deliberately not used to mark the Mega Test task complete. Only the
  // signed AdMob SSV callback can atomically complete the server-owned attempt.
  await AdMob.showRewardVideoAd();
}

/** Official Google test ad. No attempt/SSV correlation, so it can never satisfy a Mega Test task. */
export async function showAdMobIntegrationTest() {
  if (!(await isNativeApp())) throw new Error("Open this admin tool in the Android app");
  const AdMob = await initializeAdMob();
  await AdMob.prepareRewardVideoAd({
    adId: "ca-app-pub-3940256099942544/5224354917",
    isTesting: true,
    npa: true,
  });
  await AdMob.showRewardVideoAd();
  return { verified: false as const };
}
