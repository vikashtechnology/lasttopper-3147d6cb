// Signup alerts now use the same unified Telegram bot (connector gateway)
// as all other alerts. Kept as a thin re-export for existing call sites.
import { sendTelegramAlert } from "./telegram-alert";

export async function sendSignupAlert(text: string): Promise<void> {
  return sendTelegramAlert(text);
}
