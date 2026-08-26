import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

/** One-time, non-renewing Pro passes with fixed server-side pricing. */
type Purpose = "pro_weekly" | "pro" | "pro_yearly";
const purposeSchema = z.enum(["pro_weekly", "pro", "pro_yearly"]);

function amountFor(purpose: Purpose): number {
  if (purpose === "pro_weekly") return 4_900; // ₹49 / 7 days
  if (purpose === "pro") return 14_900; // ₹149 / 30 days
  return 149_900; // ₹1,499 / 365 days
}

function razorpayAuth() {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error("Razorpay not configured");
  return { key, secret, basic: Buffer.from(`${key}:${secret}`).toString("base64") };
}

const createOrderSchema = z.object({ purpose: purposeSchema });

export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => createOrderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { key, basic } = razorpayAuth();
    const amount = amountFor(data.purpose);
    const receipt = `${data.purpose}_${context.userId.slice(0, 8)}_${Date.now()}`;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${basic}` },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt,
        notes: {
          user_id: context.userId,
          purpose: data.purpose,
          expected_amount_paise: String(amount),
          billing_model: "one_time_non_renewing",
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("[razorpay] order create failed", response.status, body);
      throw new Error(
        response.status === 401
          ? "Payment gateway is not configured correctly"
          : `Failed to create payment order (${response.status})`,
      );
    }
    const order = (await response.json()) as { id: string; amount: number; currency: string };
    if (!order.id || order.amount !== amount || order.currency !== "INR") {
      throw new Error("Payment order mismatch");
    }
    return {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: key,
    };
  });

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
  purpose: purposeSchema,
});

function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const { secret } = razorpayAuth();
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type RazorpayOrder = {
  id: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: string;
  notes?: Record<string, string>;
};
type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured?: boolean;
};

async function fetchRazorpayEntity<T>(path: string): Promise<T> {
  const { basic } = razorpayAuth();
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Could not verify payment with Razorpay (${response.status})`);
  return (await response.json()) as T;
}

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data, context }) => {
    if (
      !verifyCheckoutSignature(
        data.razorpay_order_id,
        data.razorpay_payment_id,
        data.razorpay_signature,
      )
    ) {
      throw new Error("Invalid payment signature");
    }

    const [order, payment] = await Promise.all([
      fetchRazorpayEntity<RazorpayOrder>(`orders/${encodeURIComponent(data.razorpay_order_id)}`),
      fetchRazorpayEntity<RazorpayPayment>(
        `payments/${encodeURIComponent(data.razorpay_payment_id)}`,
      ),
    ]);
    const expectedAmount = amountFor(data.purpose);
    const notes = order.notes ?? {};
    const storedPurpose = purposeSchema.safeParse(notes.purpose);
    if (
      order.id !== data.razorpay_order_id ||
      payment.id !== data.razorpay_payment_id ||
      payment.order_id !== order.id ||
      order.status !== "paid" ||
      order.amount_paid !== expectedAmount ||
      order.amount_due !== 0 ||
      payment.status !== "captured" ||
      payment.captured !== true ||
      order.currency !== "INR" ||
      payment.currency !== "INR" ||
      order.amount !== expectedAmount ||
      payment.amount !== expectedAmount ||
      notes.expected_amount_paise !== String(expectedAmount) ||
      notes.billing_model !== "one_time_non_renewing" ||
      notes.user_id !== context.userId ||
      !storedPurpose.success ||
      storedPurpose.data !== data.purpose
    ) {
      throw new Error("Payment details do not match the server-created order");
    }

    const { firestoreAdmin } = await import("@/integrations/firebase/data.server");
    const { data: fulfillment, error } = await (firestoreAdmin as any).rpc("fulfill_pro_payment", {
      p_payment_id: payment.id,
      p_order_id: order.id,
      p_user_id: context.userId,
      p_purpose: storedPurpose.data,
      p_amount_paise: expectedAmount,
    });
    if (error) throw error;
    const result = Array.isArray(fulfillment) ? fulfillment[0] : fulfillment;
    if (!result?.fulfilled || !result?.pro_until) throw new Error("Payment fulfillment failed");

    return {
      ok: true as const,
      purpose: storedPurpose.data,
      pro_until: result.pro_until as string,
    };
  });
