import { Capacitor } from "@capacitor/core";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut as webSignOut,
  type User as FirebaseUser,
} from "firebase/auth";

export type AppAuthUser = {
  id: string;
  uid: string;
  email: string | null;
  phone: string | null;
  user_metadata: {
    full_name?: string | null;
    avatar_url?: string | null;
  };
};

export type AppAuthSession = {
  access_token: string;
  user: AppAuthUser;
};

type AuthResult<T> = { data: T; error: Error | null };
type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED";

function toAppUser(user: {
  uid: string;
  email?: string | null;
  phoneNumber?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}): AppAuthUser {
  return {
    id: user.uid,
    uid: user.uid,
    email: user.email ?? null,
    phone: user.phoneNumber ?? null,
    user_metadata: {
      full_name: user.displayName ?? null,
      avatar_url: user.photoURL ?? null,
    },
  };
}

function browserAuth() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
    appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  };
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error("Firebase browser authentication is not configured");
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

async function nativeSession(): Promise<AppAuthSession | null> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  const [{ user }, { token }] = await Promise.all([
    FirebaseAuthentication.getCurrentUser(),
    FirebaseAuthentication.getIdToken(),
  ]);
  if (!user || !token) return null;
  return { access_token: token, user: toAppUser(user) };
}

async function webSession(user?: FirebaseUser | null): Promise<AppAuthSession | null> {
  const auth = browserAuth();
  const current = user === undefined ? auth.currentUser : user;
  if (!current) return null;
  return { access_token: await current.getIdToken(), user: toAppUser(current) };
}

export const firebaseClient = {
  auth: {
    async getSession(): Promise<AuthResult<{ session: AppAuthSession | null }>> {
      try {
        const session = Capacitor.isNativePlatform() ? await nativeSession() : await webSession();
        return { data: { session }, error: null };
      } catch (error) {
        return {
          data: { session: null },
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },

    async getUser(): Promise<AuthResult<{ user: AppAuthUser | null }>> {
      const result = await this.getSession();
      return { data: { user: result.data.session?.user ?? null }, error: result.error };
    },

    async signInWithGoogle(): Promise<AuthResult<{ session: AppAuthSession | null }>> {
      try {
        if (Capacitor.isNativePlatform()) {
          const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
          await FirebaseAuthentication.signInWithGoogle();
          return { data: { session: await nativeSession() }, error: null };
        }
        const credential = await signInWithPopup(browserAuth(), new GoogleAuthProvider());
        return { data: { session: await webSession(credential.user) }, error: null };
      } catch (error) {
        return {
          data: { session: null },
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },

    async signOut(): Promise<AuthResult<null>> {
      try {
        if (Capacitor.isNativePlatform()) {
          const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
          await FirebaseAuthentication.signOut();
        } else {
          await webSignOut(browserAuth());
        }
        return { data: null, error: null };
      } catch (error) {
        return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
      }
    },

    onAuthStateChange(callback: (event: AuthEvent, session: AppAuthSession | null) => void) {
      let disposed = false;
      let removeNative: (() => Promise<void>) | undefined;
      let removeWeb: (() => void) | undefined;
      let previousUserId: string | null | undefined;

      if (Capacitor.isNativePlatform()) {
        void import("@capacitor-firebase/authentication").then(
          async ({ FirebaseAuthentication }) => {
            const listener = await FirebaseAuthentication.addListener("idTokenChange", async () => {
              if (disposed) return;
              const session = await nativeSession().catch(() => null);
              const event: AuthEvent = session
                ? previousUserId
                  ? "TOKEN_REFRESHED"
                  : "SIGNED_IN"
                : "SIGNED_OUT";
              previousUserId = session?.user.id ?? null;
              callback(event, session);
            });
            removeNative = () => listener.remove();
            const session = await nativeSession().catch(() => null);
            previousUserId = session?.user.id ?? null;
            if (!disposed) callback("INITIAL_SESSION", session);
          },
        );
      } else {
        removeWeb = onIdTokenChanged(browserAuth(), async (user) => {
          if (disposed) return;
          const session = await webSession(user);
          const event: AuthEvent =
            previousUserId === undefined
              ? "INITIAL_SESSION"
              : session
                ? previousUserId
                  ? "TOKEN_REFRESHED"
                  : "SIGNED_IN"
                : "SIGNED_OUT";
          previousUserId = session?.user.id ?? null;
          callback(event, session);
        });
      }

      return {
        data: {
          subscription: {
            unsubscribe() {
              disposed = true;
              removeWeb?.();
              void removeNative?.();
            },
          },
        },
      };
    },
  },
};
