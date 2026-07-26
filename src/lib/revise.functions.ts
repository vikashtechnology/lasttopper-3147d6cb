import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReviseTopic = {
  id: string;
  chapter_id: string;
  title: string;
  slug: string;
  summary: string | null;
  key_points: string[];
  formulas: string[];
  refs: { title: string; url: string; source: string }[];
  display_order: number;
  generated_at: string | null;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function callGemini<T>(prompt: string, schema: Record<string, unknown>): Promise<T> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        {
          role: "system",
          content:
            "You are an NCERT-aligned exam tutor for Indian JEE/NEET students. Reply only using the requested tool. Content must be strictly from NCERT curriculum (Class 11–12).",
        },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: { name: "reply", description: "Return structured response", parameters: schema },
        },
      ],
      tool_choice: { type: "function", function: { name: "reply" } },
    }),
  });
  if (res.status === 429) throw new Error("AI is busy right now, try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits.");
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no content");
  return JSON.parse(args) as T;
}

async function firecrawlReferences(topic: string, chapter: string): Promise<ReviseTopic["refs"]> {
  const lovKey = process.env.LOVABLE_API_KEY;
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!lovKey || !fcKey) return [];
  const sites = ["ncert.nic.in", "unacademy.com", "vedantu.com", "oswaalbooks.com", "byjus.com"];
  const query = `${topic} ${chapter} ${sites.map((s) => `site:${s}`).join(" OR ")}`;
  try {
    const res = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovKey}`,
        "X-Connection-Api-Key": fcKey,
      },
      body: JSON.stringify({ query, limit: 6 }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const items: Array<{ url?: string; title?: string; description?: string }> =
      json?.data?.web ?? json?.data ?? json?.results ?? [];
    const seen = new Set<string>();
    const refs: ReviseTopic["refs"] = [];
    for (const it of items) {
      if (!it.url) continue;
      let host: string;
      try {
        host = new URL(it.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      const source = sites.find((s) => host.endsWith(s));
      if (!source) continue;
      if (seen.has(host + it.url)) continue;
      seen.add(host + it.url);
      refs.push({ title: it.title ?? host, url: it.url, source });
      if (refs.length >= 5) break;
    }
    return refs;
  } catch {
    return [];
  }
}

export const getChapterTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ chapter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ chapter: { id: string; name: string; class_level: number } | null; topics: ReviseTopic[] }> => {
    const { data: chapter } = await context.supabase
      .from("chapters")
      .select("id, name, class_level, subject_id")
      .eq("id", data.chapter_id)
      .maybeSingle();
    if (!chapter) return { chapter: null, topics: [] };

    const { data: existing } = await context.supabase
      .from("revise_topics")
      .select("*")
      .eq("chapter_id", data.chapter_id)
      .order("display_order");

    if (existing && existing.length > 0) {
      return { chapter, topics: existing as unknown as ReviseTopic[] };
    }

    // Generate topic list via AI
    const { data: subject } = await context.supabase
      .from("subjects")
      .select("name")
      .eq("id", chapter.subject_id)
      .maybeSingle();

    const result = await callGemini<{ topics: { title: string }[] }>(
      `List 8-12 revision topics for the NCERT Class ${chapter.class_level} ${subject?.name ?? ""} chapter "${chapter.name}". Only include core NCERT concepts (no extra material). Order from foundational to advanced.`,
      {
        type: "object",
        properties: {
          topics: {
            type: "array",
            items: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
          },
        },
        required: ["topics"],
      },
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = result.topics.slice(0, 12).map((t, i) => ({
      chapter_id: data.chapter_id,
      title: t.title.slice(0, 200),
      slug: slugify(t.title) || `topic-${i + 1}`,
      display_order: i,
    }));
    const { data: inserted, error } = await supabaseAdmin
      .from("revise_topics")
      .upsert(rows, { onConflict: "chapter_id,slug", ignoreDuplicates: true })
      .select("*")
      .order("display_order");
    if (error) throw error;
    return { chapter, topics: (inserted ?? []) as unknown as ReviseTopic[] };
  });

export const getTopicRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ReviseTopic> => {
    const { data: topic, error } = await context.supabase
      .from("revise_topics")
      .select("*, chapters(name, class_level, subjects(name))")
      .eq("id", data.topic_id)
      .maybeSingle();
    if (error) throw error;
    if (!topic) throw new Error("Topic not found");

    if (topic.summary && topic.generated_at) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { chapters: _c, ...rest } = topic as Record<string, unknown>;
      return rest as unknown as ReviseTopic;
    }

    const ch = (topic as unknown as { chapters: { name: string; class_level: number; subjects: { name: string } } }).chapters;
    const ai = await callGemini<{ summary: string; key_points: string[]; formulas: string[] }>(
      `Write a concise NCERT-only revision note for the topic "${topic.title}" from the Class ${ch.class_level} ${ch.subjects.name} chapter "${ch.name}".

Return:
- summary: 120-180 word plain-language explanation, exam-focused.
- key_points: 5-8 crisp bullet points a student must remember.
- formulas: important formulas or reactions (use plain text / LaTeX like $E=mc^2$). Empty array if none.

Do NOT include copyrighted text from any textbook — write in your own words.`,
      {
        type: "object",
        properties: {
          summary: { type: "string" },
          key_points: { type: "array", items: { type: "string" } },
          formulas: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "key_points", "formulas"],
      },
    );

    const refs = await firecrawlReferences(topic.title, ch.name);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("revise_topics")
      .update({
        summary: ai.summary,
        key_points: ai.key_points,
        formulas: ai.formulas,
        refs,
        generated_at: new Date().toISOString(),
      })
      .eq("id", data.topic_id)
      .select("*")
      .maybeSingle();
    if (upErr) throw upErr;
    return updated as unknown as ReviseTopic;
  });
