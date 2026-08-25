import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  getMegaTaskPartnerSecret,
  verifyMegaTaskPartnerSignature,
} from "@/lib/mega-task-verification.server";

const providerSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/);
const callbackSchema = z
  .object({
    attempt_id: z.string().uuid(),
    nonce: z.string().uuid(),
    transaction_id: z.string().trim().min(1).max(200),
  })
  .strict();

function response(status: number, text = "") {
  return new Response(status === 204 ? null : text, {
    status,
    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
  });
}

class CallbackTooLargeError extends Error {}

async function readLimitedText(request: Request, limit: number) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new CallbackTooLargeError();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new CallbackTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Signed external Mega Test task callback.
 *
 * Required headers:
 *   x-mega-task-partner: configured provider key
 *   x-mega-task-timestamp: Unix seconds (within 10 minutes)
 *   x-mega-task-signature: hex HMAC-SHA256 of `${timestamp}.${provider}.${rawBody}`
 */
export const Route = createFileRoute("/api/public/hooks/mega-task-partner")({
  server: {
    handlers: {
      GET: () => response(405, "Method Not Allowed"),
      POST: async ({ request }) => {
        let rawBody: string;
        try {
          rawBody = await readLimitedText(request, 4096);
        } catch (error) {
          return error instanceof CallbackTooLargeError
            ? response(413, "Callback too large")
            : response(400, "Invalid callback encoding");
        }
        const providerRaw = request.headers.get("x-mega-task-partner") ?? "";
        const timestamp = request.headers.get("x-mega-task-timestamp") ?? "";
        const signature = request.headers.get("x-mega-task-signature") ?? "";

        let provider: string;
        try {
          provider = providerSchema.parse(providerRaw.trim().toLowerCase());
        } catch {
          return response(401, "Invalid callback");
        }
        const secret = getMegaTaskPartnerSecret(provider);
        if (!secret) return response(503, "Partner not configured");

        const timestampSeconds = Number(timestamp);
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (
          !/^\d{10}$/.test(timestamp) ||
          !Number.isSafeInteger(timestampSeconds) ||
          timestampSeconds > nowSeconds + 60 ||
          timestampSeconds < nowSeconds - 10 * 60
        ) {
          return response(401, "Invalid callback");
        }
        if (!verifyMegaTaskPartnerSignature({ provider, timestamp, rawBody, signature, secret })) {
          return response(401, "Invalid callback");
        }

        let payload: z.infer<typeof callbackSchema>;
        try {
          payload = callbackSchema.parse(JSON.parse(rawBody));
        } catch {
          return response(400, "Invalid callback");
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await (supabaseAdmin as any).rpc("complete_mega_access_task_attempt", {
            p_attempt_id: payload.attempt_id,
            p_nonce: payload.nonce,
            p_provider: provider,
            p_transaction_id: payload.transaction_id,
            p_provider_timestamp: new Date(timestampSeconds * 1000).toISOString(),
            p_provider_user_id: null,
            p_provider_placement_id: null,
            p_callback_payload: {
              partner: provider,
              transaction_id: payload.transaction_id,
              callback_timestamp: timestampSeconds,
            },
          });
          if (error) throw error;
          return response(204);
        } catch (error) {
          console.warn(
            "Mega task partner callback rejected",
            error instanceof Error ? error.message : "unknown error",
          );
          return response(409, "Callback rejected");
        }
      },
    },
  },
});
