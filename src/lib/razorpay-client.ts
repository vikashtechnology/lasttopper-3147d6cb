/**
 * Razorpay Checkout loader + opener.
 * Client-side helper used by Pricing & Wallet pages.
 */
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/razorpay.functions";

type RazorpayCheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (opts: RazorpayCheckoutOptions) => { open: () => void };
  }
}

let loading: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.head.appendChild(s);
  });
  return loading;
}

export type PayArgs =
  | { purpose: "pro"; name?: string | null; email?: string | null; description?: string }
  | { purpose: "pro_yearly"; name?: string | null; email?: string | null; description?: string }
  | { purpose: "pro_weekly"; name?: string | null; email?: string | null; description?: string }
  | { purpose: "wallet_topup"; amount_inr: number; name?: string | null; email?: string | null; description?: string };

export async function payWithRazorpay(args: PayArgs): Promise<{
  purpose: "pro" | "pro_yearly" | "pro_weekly" | "wallet_topup";
  balance?: number;
}> {
  await loadCheckout();
  const order = await createRazorpayOrder({
    data:
      args.purpose === "wallet_topup"
        ? { purpose: "wallet_topup", amount_inr: args.amount_inr }
        : { purpose: args.purpose },
  });

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: "Last Topper",
      description: args.description ?? (args.purpose === "wallet_topup" ? "Wallet top-up" : args.purpose === "pro_yearly" ? "Pro yearly subscription" : args.purpose === "pro_weekly" ? "Pro weekly subscription" : "Pro monthly subscription"),
      prefill: { name: args.name ?? undefined, email: args.email ?? undefined },
      theme: { color: "#4f46e5" },
      handler: async (r) => {
        try {
          const res = await verifyRazorpayPayment({
            data: {
              razorpay_order_id: r.razorpay_order_id,
              razorpay_payment_id: r.razorpay_payment_id,
              razorpay_signature: r.razorpay_signature,
              purpose: args.purpose,
              amount_inr: args.purpose === "wallet_topup" ? args.amount_inr : undefined,
            },
          });
          resolve(res);
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.open();
  });
}
