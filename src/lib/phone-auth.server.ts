/**
 * Server-only helpers for WhatsApp (Evolution API) phone login.
 */

/** Normalises any Indian-style input to a bare E.164 digit string, e.g. "919876543210". */
export function normalisePhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.length === 10) d = `91${d}`;
  if (d.startsWith("0") && d.length === 11) d = `91${d.slice(1)}`;
  if (d.length < 11 || d.length > 15) return null;
  return d;
}

/** Synthetic auth email derived from the phone number (phone users have no real inbox). */
export function phoneEmail(phone: string): string {
  return `p${phone}@phone.lasttopper.app`;
}

export function generateCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, "0");
}

export async function hashCode(phone: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${phone}:${code}:lasttopper`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Sends a WhatsApp text through a self-hosted Evolution API instance. */
export async function sendWhatsappText(phone: string, text: string): Promise<void> {
  const base = (process.env["EVOLUTION_API_URL"] || "").replace(/\/+$/, "");
  const key = process.env["EVOLUTION_API_KEY"];
  const instance = process.env["EVOLUTION_INSTANCE"];
  if (!base || !key || !instance) throw new Error("Evolution API is not configured");

  const res = await fetch(`${base}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number: phone, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Evolution API sendText failed [${res.status}]: ${body}`);
    throw new Error("WhatsApp send failed");
  }
}
