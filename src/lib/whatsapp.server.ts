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
