/**
 * Razorpay webhook — redundancy layer.
 * Client-side verifyRazorpayPayment is the primary path; this catches
 * cases where the user closes the tab before the handler completes.
 *
 * Configure in Razorpay Dashboard → Settings → Webhooks:
 *   URL:    https://<published-domain>/api/public/hooks/razorpay
 *   Events: payment.captured
 *   Secret: matches RAZORPAY_WEBHOOK_SECRET
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 500 });

        const signature = request.headers.get("x-razorpay-signature");
        const raw = await request.text();
        if (!signature) return new Response("Missing signature", { status: 401 });

        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        const a = Buffer.from(expected);
        const b = Buffer.from(signature);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: {
          event?: string;
          payload?: {
            payment?: { entity?: { id?: string; order_id?: string; amount?: number; notes?: Record<string, string> } };
          };
        };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        if (payload.event !== "payment.captured") return new Response("ok");
        const p = payload.payload?.payment?.entity;
        const notes = p?.notes ?? {};
        const userId = notes.user_id;
        const purpose = notes.purpose;
        const paymentId = p?.id;
        if (!userId || !purpose || !paymentId) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (purpose === "pro" || purpose === "pro_yearly") {
          const { data: u } = await supabaseAdmin
            .from("users").select("is_pro, pro_until").eq("id", userId).maybeSingle();
          const days = purpose === "pro_yearly" ? 365 : 30;
          const base = u?.pro_until && new Date(u.pro_until as string).getTime() > Date.now()
            ? new Date(u.pro_until as string).getTime()
            : Date.now();
          const until = new Date(base + days * 86400_000).toISOString();
          await supabaseAdmin
            .from("users")
            .update({ is_pro: true, pro_since: new Date().toISOString(), pro_until: until })
            .eq("id", userId);
          return new Response("ok");
        }

        if (purpose === "wallet_topup") {
          const note = `Wallet top-up via Razorpay (${paymentId})`;
          const { data: existing } = await supabaseAdmin
            .from("wallet_transactions").select("id").eq("note", note).maybeSingle();
          if (existing) return new Response("ok");
          const inr = Math.floor((p?.amount ?? 0) / 100);
          if (inr <= 0) return new Response("ok");
          const { data: u } = await supabaseAdmin
            .from("users").select("balance, referred_by, referral_credited").eq("id", userId).maybeSingle();
          const cur = Number(u?.balance ?? 0);
          const next = cur + inr;
          await supabaseAdmin.from("users").update({ balance: next }).eq("id", userId);
          await supabaseAdmin.from("wallet_transactions").insert({
            user_id: userId, type: "credit", category: "topup",
            amount: inr, balance_after: next, note, reference_id: null,
          });
          // Referral reward on first ever top-up: 5 TC to the referrer, usable only for Mega Test.
          if (u?.referred_by && !u.referral_credited) {
            const REFERRAL_TC = 5;
            const { data: ref } = await supabaseAdmin
              .from("users").select("mega_credits").eq("id", u.referred_by).maybeSingle();
            const curMc = Number(ref?.mega_credits ?? 0);
            await supabaseAdmin.from("users")
              .update({ mega_credits: curMc + REFERRAL_TC }).eq("id", u.referred_by);
            await supabaseAdmin.from("users")
              .update({ referral_credited: true }).eq("id", userId);
            await supabaseAdmin.from("wallet_transactions").insert({
              user_id: u.referred_by, type: "credit", category: "referral",
              amount: REFERRAL_TC, balance_after: curMc + REFERRAL_TC,
              note: "Referral reward (Mega Test only)", reference_id: null,
            });
          }
          return new Response("ok");
        }

        return new Response("ok");
      },
    },
  },
});
