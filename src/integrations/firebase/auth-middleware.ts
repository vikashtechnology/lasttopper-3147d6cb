import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getFirebaseAdminAuth } from "./admin.server";
import { getFirestoreDataClient } from "./data.server";

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authorization = request?.headers?.get("authorization") ?? "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) throw new Error("Unauthorized: a Firebase ID token is required");

    try {
      const claims = await (await getFirebaseAdminAuth()).verifyIdToken(token);
      if (!claims.uid) throw new Error("token has no user ID");
      return next({
        context: {
          db: getFirestoreDataClient(),
          userId: claims.uid,
          claims,
        },
      });
    } catch {
      throw new Error("Unauthorized: invalid or expired Firebase ID token");
    }
  },
);
