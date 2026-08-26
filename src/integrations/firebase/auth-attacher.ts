import { createMiddleware } from "@tanstack/react-start";
import { firebaseClient } from "./client";

// Every TanStack server function receives the current short-lived Firebase ID
// token. The server verifies it with Firebase Admin before data access.
export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await firebaseClient.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
