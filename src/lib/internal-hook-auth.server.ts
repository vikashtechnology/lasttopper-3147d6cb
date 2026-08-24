import { timingSafeEqual } from "node:crypto";

function safeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authenticates privileged lifecycle hooks with a private, server-only secret.
 * Callers should send either `Authorization: Bearer <secret>` or
 * `X-Internal-Hook-Secret: <secret>`.
 */
export function authorizeInternalHook(request: Request): "ok" | "unconfigured" | "unauthorized" {
  const expected = process.env.INTERNAL_HOOK_SECRET?.trim();
  if (!expected) return "unconfigured";

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const explicit = request.headers.get("x-internal-hook-secret")?.trim() ?? "";
  const actual = bearer || explicit;

  return actual && safeEqual(actual, expected) ? "ok" : "unauthorized";
}

export function internalHookAuthError(status: "unconfigured" | "unauthorized"): Response {
  return status === "unconfigured"
    ? new Response("Internal hook authentication is not configured", { status: 503 })
    : new Response("Unauthorized", { status: 401 });
}
