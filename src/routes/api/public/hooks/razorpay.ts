import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const purposeSchema = z.enum(["pro_weekly", "pro", "pro_yearly"]);
type Purpose = z.infer<typeof purposeSchema>;

function amountFor(purpose: Purpose): number {
  if (purpose === "pro_weekly") return 4_900;
  if (purpose === "pro") return 14_900;
  return 149_900;
}

const paymentSchema = z.object({
  id: z.string().min(1).max(100),
  order_id: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  currency: z.literal("INR"),
  status: z.literal("captured"),
  captured: z.literal(true),
});
const webhookSchema = z.object({
  event: z.string(),
  payload: z.object({ payment: z.object({ entity: paymentSchema }) }),
});
const orderSchema = z.object({
  id: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  amount_paid: z.number().int().nonnegative(),
  amount_due: z.number().int().nonnegative(),
  currency: z.literal("INR"),
  status: z.literal("paid"),
  notes: z.record(z.string(), z.string()).default({}),
});

function response(status: number, text = "") {
  return new Response(text, {
    status,
    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
  });
}

async function fetchOrder(orderId: string) {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error("Razorpay API is not configured");
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");
  const result = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!result.ok) throw new Error(`Razorpay order verification failed (${result.status})`);
  return orderSchema.parse(await result.json());
}

/** Signed Razorpay fallback fulfillment for fixed-price, one-time Pro passes only. */
export const Route = createFileRoute("/api/public/hooks/razorpay")({
  server: {
    handlers: {
      GET: () => response(405, "Method Not Allowed"),
      POST: async ({ request }) => {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret) return response(503, "Not configured");
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const rawBody = await request.text();
        if (!/^[a-fA-F0-9]{64}$/.test(signature)) return response(401, "Invalid signature");
        const expected = createHmac("sha256", webhookSecret).update(rawBody).digest();
        const received = Buffer.from(signature, "hex");
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
          return response(401, "Invalid signature");
        }

        let parsed: z.infer<typeof webhookSchema>;
        try {
          parsed = webhookSchema.parse(JSON.parse(rawBody));
        } catch {
          return response(400, "Invalid payload");
        }
        if (parsed.event !== "payment.captured") return response(204);

        try {
          const payment = parsed.payload.payment.entity;
          const order = await fetchOrder(payment.order_id);
          const purpose = purposeSchema.safeParse(order.notes.purpose);
          const userId = z.string().uuid().safeParse(order.notes.user_id);
          if (!purpose.success || !userId.success) {
            return response(400, "Payment order metadata mismatch");
          }
          const expectedAmount = amountFor(purpose.data);
          if (
            order.id !== payment.order_id ||
            order.amount !== expectedAmount ||
            order.amount_paid !== expectedAmount ||
            order.amount_due !== 0 ||
            payment.amount !== expectedAmount ||
            order.notes.expected_amount_paise !== String(expectedAmount) ||
            order.notes.billing_model !== "one_time_non_renewing"
          ) {
            return response(400, "Payment order metadata mismatch");
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await (supabaseAdmin as any).rpc("fulfill_pro_payment", {
            p_payment_id: payment.id,
            p_order_id: order.id,
            p_user_id: userId.data,
            p_purpose: purpose.data,
            p_amount_paise: expectedAmount,
          });
          if (error) throw error;
          const fulfillment = Array.isArray(data) ? data[0] : data;
          if (!fulfillment?.fulfilled || !fulfillment?.pro_until) {
            throw new Error("Payment fulfillment returned no result");
          }
          return response(204);
        } catch (error) {
          console.error(
            "Razorpay fulfillment failed",
            error instanceof Error ? error.message : error,
          );
          return response(500, "Fulfillment failed");
        }
      },
    },
  },
});
