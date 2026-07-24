import { createFileRoute } from "@tanstack/react-router";

/**
 * Auto-process pending withdrawal requests once process_after has elapsed.
 * Mock mode: mark as processed (balance was already debited on request).
 */
export const Route = createFileRoute("/api/public/hooks/process-withdrawals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
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
