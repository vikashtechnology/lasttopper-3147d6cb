// Server-only helper (safe to import from *.functions.ts because it only
// reads process.env inside the function body, never at module scope).

export async function sendTelegramAlert(text: string): Promise<void> {
  try {
    const chat = process.env.REPORT_TELEGRAM_CHAT_ID;
    const gwKey = process.env.LOVABLE_API_KEY;
    const tgKey = process.env.TELEGRAM_API_KEY;
    if (!chat || !gwKey || !tgKey) return;
    await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gwKey}`,
        "X-Connection-Api-Key": tgKey,
      },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("[telegram] send failed", e);
  }
}
