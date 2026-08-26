import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { firebaseUidSchema } from "@/integrations/firebase/validation";
import { verifyAdMobSsvUrl } from "@/lib/mega-task-verification.server";

const correlationSchema = z.object({
  attemptId: z.string().uuid(),
  nonce: z.string().uuid(),
});

function parseCorrelation(value: string) {
  const [attemptId, nonce, extra] = value.split(".");
  if (extra) throw new Error("invalid Mega task correlation");
  return correlationSchema.parse({ attemptId, nonce });
}

function noStore(status: number, text = "") {
  return new Response(status === 204 ? null : text, {
    status,
    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
  });
}

/** Google AdMob rewarded-ad server-side verification callback. */
export const Route = createFileRoute("/api/public/hooks/admob-ssv")({
  server: {
    handlers: {
      POST: () => noStore(405, "Method Not Allowed"),
      GET: async ({ request }) => {
        if (process.env.ADMOB_TASKS_ENABLED !== "true") {
          return noStore(503, "AdMob access tasks disabled");
        }

        try {
          const payload = await verifyAdMobSsvUrl(request.url);
          // AdMob's dashboard sends a signed callback while verifying an SSV URL.
          // A fixed non-UUID marker lets that signed connectivity check succeed
          // without creating or completing a student task attempt.
          if (
            payload.customData === "last-topper-ssv-verification" &&
            payload.userId === "last-topper-ssv-verification"
          ) {
            return noStore(204);
          }

          const correlation = parseCorrelation(payload.customData);
          const userId = firebaseUidSchema.parse(payload.userId);
          const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
          const { error } = await (firestoreAdmin as any).rpc("complete_mega_access_task_attempt", {
            p_attempt_id: correlation.attemptId,
            p_nonce: correlation.nonce,
            p_provider: "admob",
            p_transaction_id: payload.transactionId,
            p_provider_timestamp: new Date(payload.timestampMs).toISOString(),
            p_provider_user_id: userId,
            p_provider_placement_id: payload.adUnit,
            p_callback_payload: {
              ad_network: payload.adNetwork,
              ad_unit: payload.adUnit,
              key_id: payload.keyId,
              provider_amount_reported: payload.rewardAmount,
              provider_item_reported: payload.rewardItem,
              timestamp_ms: payload.timestampMs,
              transaction_id: payload.transactionId,
            },
          });
          if (error) throw error;
          return noStore(204);
        } catch (error) {
          console.warn(
            "AdMob SSV rejected",
            error instanceof Error ? error.message : "unknown error",
          );
          return noStore(400, "Invalid callback");
        }
      },
    },
  },
});
