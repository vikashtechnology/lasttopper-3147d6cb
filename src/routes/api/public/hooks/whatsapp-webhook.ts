import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Evolution API Webhook handler for incoming WhatsApp messages.
 */
export const Route = createFileRoute("/api/public/hooks/whatsapp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => null);
        if (!payload || payload.event !== "messages.upsert") return Response.json({ ok: true });

        const msg = payload.data?.message;
        const from = payload.data?.key?.remoteJid;
        const text = msg?.conversation || msg?.extendedTextMessage?.text;
        const isMe = payload.data?.key?.fromMe;

        if (!from || !text || isMe) return Response.json({ ok: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Check if enabled
        const { data: setting } = await supabaseAdmin
          .from("admin_settings")
          .select("value")
          .eq("key", "whatsapp_ai_enabled")
          .maybeSingle();
        
        if (setting?.value !== "true") return Response.json({ ok: true });

        // Get AI response
        const { getAiResponse } = await import("@/lib/ai-router");
        const systemPrompt = `You are a helpful, friendly school-friend-like assistant for a student using the 'Last Topper' app. 
Respond in a friendly, supportive way. Use emojis frequently. 
Keep replies concise but warm. 
The user is likely an IIT-JEE or NEET aspirant. 
Current date: ${new Date().toLocaleDateString('en-IN')}`;

        try {
          const aiResponse = await getAiResponse([
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ]);

          if (aiResponse) {
            const { sendWhatsappText } = await import("@/lib/phone-auth.server");
            const phone = from.split("@")[0];
            await sendWhatsappText(phone, aiResponse);
          }
        } catch (err) {
          console.error("[whatsapp-ai] failed", err);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
