import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChatText } from "@/lib/ai-router";

const BUCKET = "ai-handwriting";

/** Signed URL lifetime for handwritten images (7 days). */
const SIGN_TTL = 60 * 60 * 24 * 7;

export type ChatThread = { id: string; title: string; updated_at: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_url: string | null;
  created_at: string;
};

async function signPaths(paths: (string | null)[]): Promise<Record<string, string>> {
  const real = paths.filter((p): p is string => !!p);
  if (real.length === 0) return {};
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls(real, SIGN_TTL);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}

/** All chat threads for the signed-in user, newest first. */
export const listChatThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_chat_threads")
      .select("id, title, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    return (data ?? []) as ChatThread[];
  });

export const createChatThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_chat_threads")
      .insert({ user_id: context.userId, title: "New chat" })
      .select("id, title, updated_at")
      .single();
    if (error) throw new Error("Failed");
    return data as ChatThread;
  });

export const deleteChatThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_chat_threads")
      .delete()
      .eq("id", data.threadId)
      .eq("user_id", context.userId);
    if (error) throw new Error("Failed");
    return { ok: true };
  });

export const getChatMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("ai_chat_messages")
      .select("id, role, content, image_url, created_at")
      .eq("thread_id", data.threadId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(200);
    const list = (rows ?? []) as ChatMessage[];
    const signed = await signPaths(list.map((m) => m.image_url));
    return list.map((m) => ({
      ...m,
      image_url: m.image_url ? (signed[m.image_url] ?? null) : null,
    }));
  });

/** Persist a message into a thread (owner-scoped). */
async function saveMessage(
  supabase: any,
  userId: string,
  threadId: string,
  role: "user" | "assistant",
  content: string,
  imagePath?: string | null,
) {
  await supabase.from("ai_chat_messages").insert({
    thread_id: threadId,
    user_id: userId,
    role,
    content,
    image_url: imagePath ?? null,
  });
  await supabase
    .from("ai_chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", userId);
}

/** Give a fresh thread a short title from the first user message. */
async function maybeTitle(supabase: any, userId: string, threadId: string, first: string) {
  const { data: t } = await supabase
    .from("ai_chat_threads")
    .select("title")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (t?.title && t.title !== "New chat") return;
  const title = first.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
  await supabase.from("ai_chat_threads").update({ title }).eq("id", threadId).eq("user_id", userId);
}

export const saveChatTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await saveMessage(context.supabase, context.userId, data.threadId, data.role, data.content);
    if (data.role === "user") {
      await maybeTitle(context.supabase, context.userId, data.threadId, data.content);
    }
    return { ok: true };
  });

const HANDWRITING_PROMPT = (text: string) =>
  `A photo-realistic page of a student's ruled notebook, shot straight-on in soft daylight. ` +
  `Neat, legible blue-ink cursive-print handwriting fills the page with EXACTLY this content, ` +
  `keeping the line breaks, headings, numbering and formulas as written:\n\n${text}\n\n` +
  `Underline headings, box the final answers, keep margins and a slight paper texture. ` +
  `No printed/typed text, no watermarks, no extra content.`;

/**
 * Pro-only: render text (or an AI-written solution) as a handwritten notebook page.
 * Stored in private storage; a signed URL is returned.
 */
export const generateHandwrittenImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        text: z.string().min(1).max(2000),
        mode: z.enum(["notes", "solution"]).default("notes"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("users")
      .select("is_pro")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.is_pro) throw new Error("PRO_ONLY");

    // For "solution" mode, first get a concise NCERT worked solution to write out.
    let body = data.text;
    if (data.mode === "solution") {
      try {
        body = await aiChatText({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are an NCERT tutor. Write a compact handwritten-style worked solution: a title line, numbered steps with the formula used, then 'Answer: ...'. Plain text only, no markdown, no LaTeX delimiters, under 130 words.",
            },
            { role: "user", content: data.text },
          ],
        });
      } catch {
        body = data.text;
      }
    }
    body = body
      .replace(/[*#`$]/g, "")
      .trim()
      .slice(0, 1200);

    const apiKey = (process.env.IMAGE_API_KEY ?? process.env.OPENAI_API_KEY)?.trim();
    const endpoint =
      process.env.IMAGE_API_URL?.trim() || "https://api.openai.com/v1/images/generations";
    const model = process.env.IMAGE_MODEL?.trim() || "gpt-image-1";
    if (!apiKey) throw new Error("Image generation is not configured");

    let bytes: Uint8Array;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: HANDWRITING_PROMPT(body),
          quality: "low",
          size: "1024x1536",
          n: 1,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "image request failed");
        throw new Error(`${response.status}: ${detail.slice(0, 300)}`);
      }
      const json = (await response.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
      };
      const image = json.data?.[0];
      if (image?.b64_json) {
        bytes = Uint8Array.from(atob(image.b64_json), (character) => character.charCodeAt(0));
      } else if (image?.url) {
        const download = await fetch(image.url);
        if (!download.ok) throw new Error(`Image download failed: ${download.status}`);
        bytes = new Uint8Array(await download.arrayBuffer());
      } else {
        throw new Error("Image provider returned no image data");
      }
    } catch (error) {
      console.error("[handwriting]", error instanceof Error ? error.message : String(error));
      throw new Error("Failed");
    }

    const path = `${context.userId}/${Date.now()}.png`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error("Failed");

    await saveMessage(
      context.supabase,
      context.userId,
      data.threadId,
      "assistant",
      data.mode === "solution" ? "Handwritten solution ✍️" : "Handwritten notes ✍️",
      path,
    );

    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGN_TTL);
    return { url: signed?.signedUrl ?? "", caption: body };
  });
