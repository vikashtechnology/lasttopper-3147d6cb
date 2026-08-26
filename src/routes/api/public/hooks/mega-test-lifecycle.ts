import { createFileRoute } from "@tanstack/react-router";
import { authorizeInternalHook, internalHookAuthError } from "@/lib/internal-hook-auth.server";
import { runMegaTestLifecycle } from "@/lib/mega-lifecycle.server";

/**
 * GitHub Actions calls this private endpoint every five minutes. Authenticated
 * application requests can invoke the same idempotent recovery path.
 */
export const Route = createFileRoute("/api/public/hooks/mega-test-lifecycle")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }),
      POST: async ({ request }) => {
        const auth = authorizeInternalHook(request);
        if (auth !== "ok") return internalHookAuthError(auth);
        return Response.json({ ok: true, ...(await runMegaTestLifecycle()) });
      },
    },
  },
});
