/**
 * Multi-provider AI router with automatic key rotation.
 *
 * Order of attempts (each key is tried until one succeeds):
 *   1. GEMINI_API_KEY_1 / _2 / _3   -> Google Generative Language (OpenAI-compatible endpoint)
 *   2. OPENROUTER_API_KEY_1 / _2    -> OpenRouter
 *   3. LOVABLE_API_KEY              -> Lovable AI Gateway (final safety net)
 *
 * A provider is skipped and the next key used when it returns
 * 401 / 402 / 403 / 429 (quota, billing or auth exhausted) or a 5xx.
 * All request/response shapes are OpenAI chat-completions compatible.
 */

export type ChatBody = {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  response_format?: unknown;
  tools?: unknown;
  tool_choice?: unknown;
  temperature?: number;
};

type Provider = {
  label: string;
  url: string;
  headers: Record<string, string>;
  model: (m: string) => string;
};

/** Google's native API uses bare model ids. */
function toGeminiModel(model: string): string {
  const bare = model.replace(/^google\//, "");
  if (/lite/i.test(bare)) return "gemini-flash-lite-latest";
  if (/pro/i.test(bare)) return "gemini-pro-latest";
  return "gemini-flash-latest";
}

/** OpenRouter needs an id that actually exists in its catalog. */
function toOpenRouterModel(model: string): string {
  const bare = model.replace(/^google\//, "");
  if (/lite/i.test(bare)) return "google/gemini-2.5-flash-lite";
  if (/pro/i.test(bare)) return "google/gemini-2.5-pro";
  return "google/gemini-2.5-flash";
}

/** xAI Grok model ids. */
function toGrokModel(model: string): string {
  const bare = model.replace(/^google\//, "");
  if (/lite/i.test(bare)) return "grok-4-fast-non-reasoning";
  return "grok-4-fast-non-reasoning";
}

function buildProviders(): Provider[] {
  const list: Provider[] = [];

  for (const name of ["GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"]) {
    const key = process.env[name]?.trim();
    if (!key) continue;
    list.push({
      label: name,
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      model: toGeminiModel,
    });
  }

  for (const name of ["OPENROUTER_API_KEY_1", "OPENROUTER_API_KEY_2"]) {
    const key = process.env[name]?.trim();
    if (!key) continue;
    list.push({
      label: name,
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      model: toOpenRouterModel,
    });
  }

  const lov = process.env.LOVABLE_API_KEY?.trim();
  if (lov) {
    list.push({
      label: "LOVABLE_API_KEY",
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lov}` },
      model: (m) => m,
    });
  }

  return list;
}

/** True when we should give up on this key and move to the next one. */
function shouldRotate(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 429 || status >= 500;
}

export class AiUnavailableError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "AiUnavailableError";
    this.status = status;
  }
}

/**
 * Runs a chat completion across every configured key until one succeeds.
 * Returns the parsed OpenAI-style JSON response.
 */
export async function aiChat(body: ChatBody): Promise<any> {
  const providers = buildProviders();
  if (providers.length === 0) throw new AiUnavailableError("No AI provider keys configured", 500);

  const requested = body.model ?? "google/gemini-2.5-flash";
  let lastStatus = 503;
  let lastText = "AI unavailable";

  for (const p of providers) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const resp = await fetch(p.url, {
          method: "POST",
          headers: p.headers,
          body: JSON.stringify({ ...body, model: p.model(requested) }),
        });

        if (resp.ok) return await resp.json();

        lastStatus = resp.status;
        lastText = await resp.text().catch(() => "");
        console.error(`[ai-router] ${p.label} -> ${resp.status} ${lastText.slice(0, 300)}`);

        if (resp.status === 429 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue; // one quick retry before rotating
        }
        if (shouldRotate(resp.status)) break; // next key
        break; // non-retryable (400 etc.) -> still try next provider
      } catch (e) {
        lastText = e instanceof Error ? e.message : String(e);
        console.error(`[ai-router] ${p.label} network error: ${lastText}`);
        break;
      }
    }
  }

  throw new AiUnavailableError(`All AI providers failed (last ${lastStatus}: ${lastText.slice(0, 200)})`, lastStatus);
}

/** Convenience: returns the assistant message text. */
export async function aiChatText(body: ChatBody): Promise<string> {
  const json = await aiChat(body);
  return (json?.choices?.[0]?.message?.content ?? "") as string;
}
