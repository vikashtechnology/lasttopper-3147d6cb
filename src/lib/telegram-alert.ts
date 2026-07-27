// Server-only helper (safe to import from *.functions.ts because it only
// reads process.env inside the function body, never at module scope).

function creds() {
  const chat = process.env.REPORT_TELEGRAM_CHAT_ID;
  const gwKey = process.env.LOVABLE_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;
  if (!chat || !gwKey || !tgKey) return null;
  return { chat, gwKey, tgKey };
}

export async function sendTelegramAlert(text: string): Promise<void> {
  try {
    const c = creds();
    if (!c) return;
    await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.gwKey}`,
        "X-Connection-Api-Key": c.tgKey,
      },
      body: JSON.stringify({ chat_id: c.chat, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("[telegram] send failed", e);
  }
}

/** Slugify a name so it is safe inside a Telegram filename. */
export function safeFileName(parts: string[], ext: "txt" | "json"): string {
  const base = parts
    .map((p) => String(p ?? "").trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)
    .join("+")
    .slice(0, 80);
  return `${base || "alert"}.${ext}`;
}

/**
 * Sends the alert as an attached document (e.g. "Vikash+withdrawal_793624.txt")
 * with a short caption, instead of a long chat message.
 */
export async function sendTelegramDocument(
  fileName: string,
  content: string,
  caption?: string,
): Promise<void> {
  try {
    const c = creds();
    if (!c) return;
    const form = new FormData();
    form.append("chat_id", c.chat);
    if (caption) {
      form.append("caption", caption.slice(0, 1000));
      form.append("parse_mode", "HTML");
    }
    const type = fileName.endsWith(".json") ? "application/json" : "text/plain";
    form.append("document", new Blob([content], { type }), fileName);

    const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendDocument", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.gwKey}`,
        "X-Connection-Api-Key": c.tgKey,
      },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[telegram] sendDocument failed [${res.status}]: ${body}`);
      if (caption) await sendTelegramAlert(caption);
    }
  } catch (e) {
    console.error("[telegram] document send failed", e);
  }
}
