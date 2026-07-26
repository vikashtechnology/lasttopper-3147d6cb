import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Razorpay integration:
 * - Pro subscription (₹149 one-time / month)
 * - Wallet top-up (used to join Mega Test etc.)
 *
 * Flow:
 *   1. Client calls createRazorpayOrder -> returns { order_id, key_id, amount }
 *   2. Client opens Razorpay checkout with those params
 *   3. On success handler, client calls verifyRazorpayPayment with signature
 *      -> server verifies HMAC(order_id|payment_id, KEY_SECRET) and applies the effect
 *   4. Webhook /api/public/hooks/razorpay is a redundant safety net
 */

type Purpose = "pro" | "pro_yearly" | "pro_weekly" | "wallet_topup";

const REFERRAL_REWARD_TC = 5;

function amountFor(purpose: Purpose, requested?: number): number {
  if (purpose === "pro_weekly") return 4900; // ₹49 / week
  if (purpose === "pro") return 14900; // ₹149 / month
  if (purpose === "pro_yearly") return 149900; // ₹1499 / year
  if (purpose === "wallet_topup") {
    const amt = Math.floor((requested ?? 0) * 100);
    if (amt < 1000) throw new Error("Minimum top-up is ₹10");
    if (amt > 5_00_000) throw new Error("Maximum top-up is ₹5000");
    return amt;
  }
  throw new Error("Unknown purpose");
}

export const getRazorpayKeyId = createServerFn({ method: "GET" }).handler(async () => {
  const id = process.env.RAZORPAY_KEY_ID;
  if (!id) throw new Error("Razorpay not configured");
  return { key_id: id };
});

const createOrderSchema = z.object({
  purpose: z.enum(["pro", "pro_yearly", "wallet_topup"]),
  amount_inr: z.number().positive().optional(),
});

export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createOrderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key || !secret) throw new Error("Razorpay not configured");

    const amount = amountFor(data.purpose, data.amount_inr);
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const receipt = `${data.purpose}_${context.userId.slice(0, 8)}_${Date.now()}`;

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt,
        notes: { user_id: context.userId, purpose: data.purpose },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[razorpay] order create failed", res.status, t);
      if (res.status === 401) {
        throw new Error("Payment gateway not configured correctly. Please contact support (invalid Razorpay keys).");
      }
      throw new Error(`Failed to create order: ${res.status}`);
    }
    const order = (await res.json()) as { id: string; amount: number; currency: string };
    return { order_id: order.id, amount: order.amount, currency: order.currency, key_id: key };
  });

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  purpose: z.enum(["pro", "pro_yearly", "wallet_topup"]),
  amount_inr: z.number().positive().optional(),
});

function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => verifySchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!verifySignature(data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature)) {
      throw new Error("Invalid payment signature");
    }

    if (data.purpose === "pro" || data.purpose === "pro_yearly") {
      const days = data.purpose === "pro_yearly" ? 365 : 30;
      const until = new Date(Date.now() + days * 86400_000).toISOString();
      await context.supabase
        .from("users")
        .update({ is_pro: true, pro_since: new Date().toISOString(), pro_until: until })
        .eq("id", context.userId);
      return { ok: true as const, purpose: data.purpose };
    }

    // wallet_topup
    const amount = data.amount_inr ?? 0;
    if (amount <= 0) throw new Error("Invalid amount");
    const note = `Wallet top-up via Razorpay (${data.razorpay_payment_id})`;
    // Idempotency: if this payment_id was already credited (by client retry or webhook), no-op.
    const { data: dup } = await context.supabase
      .from("wallet_transactions").select("id, balance_after").eq("note", note).maybeSingle();
    if (dup) {
      return { ok: true as const, purpose: "wallet_topup" as const, balance: Number(dup.balance_after ?? 0) };
    }
    const { data: u } = await context.supabase
      .from("users").select("balance, referred_by, referral_credited").eq("id", context.userId).maybeSingle();
    const cur = Number(u?.balance ?? 0);
    const next = cur + amount;
    await context.supabase.from("users").update({ balance: next }).eq("id", context.userId);
    await context.supabase.from("wallet_transactions").insert({
      user_id: context.userId,
      type: "credit",
      category: "topup",
      amount,
      balance_after: next,
      note,
      reference_id: null,
    });


    // Referral reward: first-ever top-up credits referrer with 5 mega-test-only TC.
    if (u?.referred_by && !u.referral_credited) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: ref } = await supabaseAdmin
        .from("users").select("mega_credits").eq("id", u.referred_by).maybeSingle();
      const cur2 = Number(ref?.mega_credits ?? 0);
      await supabaseAdmin
        .from("users")
        .update({ mega_credits: cur2 + REFERRAL_REWARD_TC })
        .eq("id", u.referred_by);
      await supabaseAdmin.from("users")
        .update({ referral_credited: true }).eq("id", context.userId);
      await supabaseAdmin.from("wallet_transactions").insert({
        user_id: u.referred_by, type: "credit", category: "referral",
        amount: REFERRAL_REWARD_TC, balance_after: cur2 + REFERRAL_REWARD_TC,
        note: "Referral reward (Mega Test only)", reference_id: null,
      });
    }
    return { ok: true as const, purpose: "wallet_topup" as const, balance: next };
  });
