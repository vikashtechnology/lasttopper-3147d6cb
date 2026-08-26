import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

type ServiceAccountInput = {
  project_id?: string;
  projectId?: string;
  client_email?: string;
  clientEmail?: string;
  private_key?: string;
  privateKey?: string;
};

let appPromise: Promise<App> | undefined;
let dbPromise: Promise<Firestore> | undefined;

function requiredProjectId() {
  const value =
    process.env.FIREBASE_PROJECT_ID?.trim() || process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!value) throw new Error("FIREBASE_PROJECT_ID is not configured");
  return value;
}

function parseServiceAccount(): ServiceAccountInput | null {
  const input = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!input) return null;

  const candidates = [input];
  try {
    candidates.push(Buffer.from(input, "base64").toString("utf8"));
  } catch {
    // The raw JSON candidate below will produce the useful configuration error.
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as ServiceAccountInput;
    } catch {
      // Try the next representation.
    }
  }
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be raw JSON or base64-encoded JSON");
}

async function initializeFirebaseAdmin(): Promise<App> {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = requiredProjectId();
  const serviceAccount = parseServiceAccount();
  if (serviceAccount) {
    const clientEmail = serviceAccount.client_email ?? serviceAccount.clientEmail;
    const privateKey = (serviceAccount.private_key ?? serviceAccount.privateKey)?.replace(
      /\\n/g,
      "\n",
    );
    if (!clientEmail || !privateKey) {
      throw new Error("Firebase service account JSON is missing client_email or private_key");
    }
    return initializeApp({
      projectId,
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (clientEmail && privateKey) {
    return initializeApp({
      projectId,
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  // Application Default Credentials are only usable where Google-managed
  // credentials exist (local gcloud, emulator, Compute). On Vercel there is
  // no ADC, and firebase-admin's lazy gRPC init turns the missing-credential
  // error into an unhandled rejection that kills the whole lambda process.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId, credential: applicationDefault() });
  }
  throw new Error(
    "Firebase Admin is not configured: set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)",
  );
}

export async function getFirebaseAdminApp(): Promise<App> {
  appPromise ??= initializeFirebaseAdmin();
  return appPromise;
}

export async function getFirebaseAdminAuth(): Promise<Auth> {
  return getAuth(await getFirebaseAdminApp());
}

export async function getFirebaseAdminDb(): Promise<Firestore> {
  dbPromise ??= getFirebaseAdminApp().then((app) => {
    const db = getFirestore(app);
    db.settings({ ignoreUndefinedProperties: true });
    return db;
  });
  return dbPromise;
}
