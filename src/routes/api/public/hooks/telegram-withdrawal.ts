import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function deriveSecret(key: string) {
  return createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url");
}
function safeEqual(a: string, b: string) {
  const A = Buffer.from(a); const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function tgReply(chatId: number | string, text: string) {
  const gw = process.env.LOVABLE_API_KEY;
  const tg = process.env.TELEGRAM_API_KEY;
  if (!gw || !tg) return;
  await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gw}`,
      "X-Connection-Api-Key": tg,
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export const Route = createFileRoute("/api/public/hooks/telegram-withdrawal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TG = process.env.TELEGRAM_API_KEY;
        if (!TG) return new Response("Not configured", { status: 500 });
        const expected = deriveSecret(TG);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        const update = await request.json().catch(() => null) as {
          message?: { chat?: { id?: number }; text?: string; from?: { id?: number } };
        } | null;
        const msg = update?.message;
        const chatId = msg?.chat?.id;
        const text = (msg?.text ?? "").trim();
        if (!chatId || !text) return Response.json({ ok: true });

        const allowedChat = process.env.REPORT_TELEGRAM_CHAT_ID;
        if (allowedChat && String(chatId) !== String(allowedChat)) {
          return Response.json({ ok: true, ignored: true });
        }

        const m = text.match(/^\/(approve|reject)\s+id\s*=\s*(\d+)/i);
        if (!m) {
          if (/^\/(approve|reject)\b/i.test(text)) {
            await tgReply(chatId, "Usage: <code>/approve id=123456</code> or <code>/reject id=123456</code>");
          }
          return Response.json({ ok: true });
        }
        const action = m[1].toLowerCase() as "approve" | "reject";
        const shortCode = Number(m[2]);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: wr } = await supabaseAdmin
          .from("withdrawal_requests")
          .select("id, user_id, amount, status, method, upi_id")
          .eq("short_code", shortCode)
          .maybeSingle();

        if (!wr) {
          await tgReply(chatId, `❌ Withdrawal <b>#${shortCode}</b> not found.`);
          return Response.json({ ok: true });
        }
        if (wr.status !== "pending") {
          await tgReply(chatId, `⚠️ Withdrawal <b>#${shortCode}</b> already <b>${wr.status}</b>.`);
          return Response.json({ ok: true });
        }

        const now = new Date().toISOString();
        if (action === "approve") {
          await supabaseAdmin.from("withdrawal_requests")
            .update({ status: "processed", processed_at: now }).eq("id", wr.id);
          await tgReply(chatId, `✅ Approved withdrawal <b>#${shortCode}</b> — ₹${wr.amount} (${wr.method.toUpperCase()}).`);
        } else {
          // Refund the amount back to the user's wallet.
          const { data: u } = await supabaseAdmin.from("users")
            .select("balance").eq("id", wr.user_id).maybeSingle();
          const cur = Number(u?.balance ?? 0);
          const next = cur + Number(wr.amount);
          await supabaseAdmin.from("users").update({ balance: next }).eq("id", wr.user_id);
          await supabaseAdmin.from("wallet_transactions").insert({
            user_id: wr.user_id, type: "credit", category: "refund",
            amount: Number(wr.amount), balance_after: next,
            note: `Withdrawal #${shortCode} rejected — refund`, reference_id: wr.id,
          });
          await supabaseAdmin.from("withdrawal_requests")
            .update({ status: "rejected", processed_at: now }).eq("id", wr.id);
          await tgReply(chatId, `🚫 Rejected withdrawal <b>#${shortCode}</b> — ₹${wr.amount} refunded to user's wallet.`);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
