import { createFileRoute } from "@tanstack/react-router";
import { authorizeInternalHook, internalHookAuthError } from "@/lib/internal-hook-auth.server";

/**
 * Auto-process pending withdrawal requests once process_after has elapsed.
 * Mock mode: mark as processed (balance was already debited on request).
 */
export const Route = createFileRoute("/api/public/hooks/process-withdrawals")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }),
      POST: async ({ request }) => {
        const auth = authorizeInternalHook(request);
        if (auth !== "ok") return internalHookAuthError(auth);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { data: rows } = await supabaseAdmin
          .from("withdrawal_requests")
          .select("id, user_id, amount")
          .eq("status", "pending")
          .lte("process_after", now)
          .limit(100);

        for (const r of rows ?? []) {
          await supabaseAdmin
            .from("withdrawal_requests")
            .update({ status: "processed", processed_at: now })
            .eq("id", r.id);
        }
        return Response.json({ processed: (rows ?? []).length });
      },
    },
  },
});
