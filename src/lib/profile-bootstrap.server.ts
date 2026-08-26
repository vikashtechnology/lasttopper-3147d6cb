import { createHash } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getFirebaseAdminDb } from "@/integrations/firebase/admin.server";

/** Creates the canonical users/{firebaseUid} document exactly once. */
export async function ensureFirstLoginProfile(userId: string, claims: DecodedIdToken) {
  const db = await getFirebaseAdminDb();
  const ref = db.collection("users").doc(userId);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(ref)).exists) return;
    const now = new Date().toISOString();
    transaction.create(ref, {
      id: userId,
      email: typeof claims.email === "string" ? claims.email.toLowerCase() : null,
      full_name: typeof claims.name === "string" ? claims.name : null,
      avatar_url: typeof claims.picture === "string" ? claims.picture : null,
      country_code: "+91",
      phone: typeof claims.phone_number === "string" ? claims.phone_number : null,
      profession: null,
      onboarded: false,
      daily_question_limit: 20,
      streak: 0,
      best_streak: 0,
      total_accuracy: 0,
      is_pro: false,
      pro_since: null,
      pro_until: null,
      bio: null,
      date_of_birth: null,
      last_active_date: null,
      last_streak_date: null,
      referral_code: createHash("sha256").update(userId).digest("hex").slice(0, 8).toUpperCase(),
      referral_credited: false,
      referred_by: null,
      reputation: 0,
      signup_alert_sent_at: null,
      terms_accepted_at: null,
      created_at: now,
      updated_at: now,
    });
  });
}
