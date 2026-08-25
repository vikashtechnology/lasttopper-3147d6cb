/** Razorpay Checkout loader for one-time, non-renewing Pro passes only. */
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
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

let loading: Promise<void> | null = null;
function loadCheckout() {
  if (typeof window === "undefined")
    return Promise.reject(new Error("Checkout requires a browser"));
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.head.appendChild(script);
  });
  return loading;
}

export type PayArgs = {
  purpose: "pro_weekly" | "pro" | "pro_yearly";
  name?: string | null;
  email?: string | null;
  description?: string;
};

export async function payWithRazorpay(args: PayArgs): Promise<{
  ok: true;
  purpose: PayArgs["purpose"];
  pro_until: string;
}> {
  await loadCheckout();
  const order = await createRazorpayOrder({
    data: { purpose: args.purpose },
  });

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: "Last Topper",
      description:
        args.description ??
        (args.purpose === "pro_yearly"
          ? "365-day Pro pass"
          : args.purpose === "pro_weekly"
            ? "7-day Pro pass"
            : "30-day Pro pass"),
      prefill: { name: args.name ?? undefined, email: args.email ?? undefined },
      theme: { color: "#4f46e5" },
      handler: async (response) => {
        try {
          const result = await verifyRazorpayPayment({
            data: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              purpose: args.purpose,
            },
          });
          resolve(result);
        } catch (error) {
          reject(error);
        }
      },
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    checkout.open();
  });
}
