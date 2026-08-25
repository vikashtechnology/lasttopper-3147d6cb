// Server-only Telegram Bot API helper.

function credentials() {
  const chatId = process.env.REPORT_TELEGRAM_CHAT_ID?.trim();
  const botToken = (process.env.TELEGRAM_API_KEY_1 ?? process.env.TELEGRAM_API_KEY)?.trim();
  if (!chatId || !botToken) return null;
  return { chatId, botToken };
}

function telegramEndpoint(botToken: string, method: string) {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

export async function sendTelegramAlert(text: string): Promise<void> {
  try {
    const config = credentials();
    if (!config) return;
    const response = await fetch(telegramEndpoint(config.botToken, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: "HTML" }),
    });
    if (!response.ok) {
      console.error(`[telegram] sendMessage failed [${response.status}]`);
    }
  } catch (error) {
    console.error("[telegram] send failed", error);
  }
}

/** Human readable IST timestamp, e.g. "01 Aug 2026, 05:24 PM IST". */
export function fmtIST(value?: string | number | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const s = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${s} IST`;
}

/** Date only, e.g. "12 Mar 2005". */
export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export type ReportRow = [label: string, value: unknown];

/**
 * Builds a clean, aligned report body:
 *
 *   ── NEW SIGNUP ─────────────────
 *   Name   : Vikash Rao
 *   Email  : a@b.com
 */
export function buildReport(title: string, rows: ReportRow[], footer?: string[]): string {
  const clean = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  const width = clean.reduce((w, [l]) => Math.max(w, l.length), 0);
  const head = `── ${title.toUpperCase()} ${"─".repeat(Math.max(4, 34 - title.length))}`;
  const body = clean.map(([l, v]) => `${l.padEnd(width)} : ${String(v)}`);
  const out = [head, "", ...body];
  if (footer?.length) out.push("", "─".repeat(38), ...footer);
  return out.join("\n") + "\n";
}

/** Slugify a name so it is safe inside a Telegram filename. */
export function safeFileName(parts: string[], ext: "txt" | "json"): string {
  const base = parts
    .map((p) =>
      String(p ?? "")
        .trim()
        .replace(/[^\w.-]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .filter(Boolean)
    .join("+")
    .slice(0, 80);
  return `${base || "alert"}.${ext}`;
}

/** Sends an operational alert as an attached document with a short caption. */
export async function sendTelegramDocument(
  fileName: string,
  content: string,
  caption?: string,
): Promise<void> {
  try {
    const config = credentials();
    if (!config) return;
    const form = new FormData();
    form.append("chat_id", config.chatId);
    if (caption) {
      form.append("caption", caption.slice(0, 1000));
      form.append("parse_mode", "HTML");
    }
    const type = fileName.endsWith(".json") ? "application/json" : "text/plain";
    form.append("document", new Blob([content], { type }), fileName);

    const response = await fetch(telegramEndpoint(config.botToken, "sendDocument"), {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      console.error(`[telegram] sendDocument failed [${response.status}]`);
      if (caption) await sendTelegramAlert(caption);
    }
  } catch (error) {
    console.error("[telegram] document send failed", error);
  }
}
