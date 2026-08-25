import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

const ADMOB_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const ADMOB_KEYS_MAX_AGE_MS = 23 * 60 * 60 * 1000;

export type AdMobSsvPayload = {
  adNetwork: string | null;
  adUnit: string;
  customData: string;
  rewardAmount: string | null;
  rewardItem: string | null;
  timestampMs: number;
  transactionId: string;
  userId: string;
  keyId: string;
};

type AdMobKey = { keyId: number; pem: string };
let admobKeyCache: { loadedAt: number; keys: AdMobKey[] } | null = null;

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

async function getAdMobKeys(): Promise<AdMobKey[]> {
  if (admobKeyCache && Date.now() - admobKeyCache.loadedAt < ADMOB_KEYS_MAX_AGE_MS) {
    return admobKeyCache.keys;
  }
  const response = await fetch(ADMOB_KEYS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`AdMob verifier keys unavailable (${response.status})`);
  const json = (await response.json()) as { keys?: AdMobKey[] };
  const keys = (json.keys ?? []).filter(
    (key) => Number.isSafeInteger(key.keyId) && typeof key.pem === "string" && key.pem.length > 50,
  );
  if (!keys.length) throw new Error("AdMob verifier keys were empty");
  admobKeyCache = { loadedAt: Date.now(), keys };
  return keys;
}

/**
 * Verifies the exact callback query bytes required by Google AdMob SSV.
 * Parsing happens only after signature verification succeeds.
 */
export async function verifyAdMobSsvUrl(requestUrl: string): Promise<AdMobSsvPayload> {
  const queryStart = requestUrl.indexOf("?");
  if (queryStart < 0) throw new Error("missing SSV query");
  const rawQuery = requestUrl.slice(queryStart + 1);
  const signatureMarker = "&signature=";
  const signatureAt = rawQuery.lastIndexOf(signatureMarker);
  if (signatureAt <= 0) throw new Error("missing SSV signature");

  // Google documents signature and key_id as the final two parameters. Reject
  // trailing/duplicated data instead of accidentally verifying only a prefix.
  const signatureTail = rawQuery.slice(signatureAt + 1);
  if (!/^signature=[^&]+&key_id=[^&]+$/.test(signatureTail)) {
    throw new Error("invalid SSV signature parameter order");
  }

  const signedBytes = rawQuery.slice(0, signatureAt);
  const parameters = new URLSearchParams(rawQuery);
  const signature = parameters.get("signature");
  const keyId = parameters.get("key_id");
  if (
    !signature ||
    !keyId ||
    parameters.getAll("signature").length !== 1 ||
    parameters.getAll("key_id").length !== 1
  ) {
    throw new Error("invalid SSV signature parameters");
  }

  const keys = await getAdMobKeys();
  const key = keys.find((candidate) => String(candidate.keyId) === keyId);
  if (!key) throw new Error("unknown AdMob verification key");

  let signatureBytes: Buffer;
  try {
    signatureBytes = decodeBase64Url(signature);
  } catch {
    throw new Error("invalid SSV signature encoding");
  }

  const valid = verify(
    "sha256",
    Buffer.from(signedBytes, "utf8"),
    createPublicKey(key.pem),
    signatureBytes,
  );
  if (!valid) throw new Error("invalid AdMob SSV signature");

  const adUnit = parameters.get("ad_unit");
  const customData = parameters.get("custom_data");
  const transactionId = parameters.get("transaction_id");
  const userId = parameters.get("user_id");
  const timestampRaw = parameters.get("timestamp");
  const timestampMs = Number(timestampRaw);
  if (!adUnit || !customData || !transactionId || !userId || !Number.isSafeInteger(timestampMs)) {
    throw new Error("missing AdMob SSV fields");
  }
  if (transactionId.length > 200 || adUnit.length > 200 || customData.length > 200) {
    throw new Error("oversized AdMob SSV fields");
  }

  const now = Date.now();
  if (timestampMs > now + 5 * 60_000 || timestampMs < now - 24 * 60 * 60_000) {
    throw new Error("stale AdMob SSV callback");
  }

  return {
    adNetwork: parameters.get("ad_network"),
    adUnit,
    customData,
    rewardAmount: parameters.get("reward_amount"),
    rewardItem: parameters.get("reward_item"),
    timestampMs,
    transactionId,
    userId,
    keyId,
  };
}

export function getMegaTaskPartnerSecret(provider: string): string | null {
  const normalized = provider.trim().toLowerCase();
  const encoded = process.env.MEGA_TASK_PARTNER_SECRETS?.trim();
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as Record<string, unknown>;
      const value = parsed[normalized];
      if (typeof value === "string" && value.length >= 32) return value;
    } catch {
      return null;
    }
  }
  const fallbackProvider = process.env.MEGA_TASK_PARTNER_ID?.trim().toLowerCase();
  const fallbackSecret = process.env.MEGA_TASK_PARTNER_SECRET?.trim();
  if (fallbackProvider === normalized && fallbackSecret && fallbackSecret.length >= 32) {
    return fallbackSecret;
  }
  return null;
}

/** Signature format: hex(HMAC_SHA256(secret, `${timestamp}.${provider}.${rawBody}`)). */
export function verifyMegaTaskPartnerSignature(args: {
  provider: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  secret: string;
}): boolean {
  if (!/^[a-fA-F0-9]{64}$/.test(args.signature)) return false;
  const expected = createHmac("sha256", args.secret)
    .update(`${args.timestamp}.${args.provider}.${args.rawBody}`, "utf8")
    .digest();
  const received = Buffer.from(args.signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
