// Server-only helper for the dedicated signup-verification Telegram bot.
export async function sendSignupAlert(text: string): Promise<void> {
  try {
    const token = process.env.SIGNUP_TELEGRAM_BOT_TOKEN;
    const chat = process.env.SIGNUP_TELEGRAM_CHAT_ID;
    if (!token || !chat) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("[signup-telegram] send failed", e);
  }
}
