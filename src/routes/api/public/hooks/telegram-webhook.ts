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
  const tg = (process.env.TELEGRAM_API_KEY_1 ?? process.env.TELEGRAM_API_KEY);
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

export const Route = createFileRoute("/api/public/hooks/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TG = (process.env.TELEGRAM_API_KEY_1 ?? process.env.TELEGRAM_API_KEY);
        if (!TG) return new Response("Not configured", { status: 500 });
        const expected = deriveSecret(TG);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        const update = await request.json().catch(() => null);
        const msg = update?.message;
        const chatId = msg?.chat?.id;
        const text = (msg?.text ?? "").trim();
        if (!chatId || !text) return Response.json({ ok: true });

        const allowedChat = process.env.REPORT_TELEGRAM_CHAT_ID;
        if (allowedChat && String(chatId) !== String(allowedChat)) {
          return Response.json({ ok: true, ignored: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Handle /wp enable and /wp disable
        if (text.match(/^\/wp\s+enable/i)) {
          await supabaseAdmin.from("admin_settings").upsert({ key: "whatsapp_ai_enabled", value: "true" }, { onConflict: "key" });
          await tgReply(chatId, "✅ <b>WhatsApp AI Automation enabled.</b>\n\nTopper AI will now respond to incoming WhatsApp messages as a friend with emojis.");
          return Response.json({ ok: true });
        }
        if (text.match(/^\/wp\s+disable/i)) {
          await supabaseAdmin.from("admin_settings").upsert({ key: "whatsapp_ai_enabled", value: "false" }, { onConflict: "key" });
          await tgReply(chatId, "❌ <b>WhatsApp AI Automation disabled.</b>\n\nIncoming WhatsApp messages will no longer be handled by AI.");
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
