import { aiChat, openRouterChat } from "@/lib/ai-router";
import type { ReviseReference, ReviseTopic } from "./revise.types";

type SupabaseContext = { supabase: { from: (table: string) => any } };

type ChapterRow = {
  id: string;
  name: string;
  class_level: number | null;
  subject_id?: string | null;
};

type ChapterDetails = {
  name: string;
  class_level: number | null;
  subjects?: { name?: string | null } | null;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function sanitizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ").slice(0, 200);
  return title.length > 0 ? title : null;
}

function isAiGenerationError(error: unknown): boolean {
  return error instanceof Error && /AI|credits|busy|gateway|LOVABLE_API_KEY/i.test(error.message);
}

async function callGemini<T>(prompt: string, schema: Record<string, unknown>): Promise<T> {
  const json = await aiChat({
      model: "google/gemini-2.5-flash",
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
  });
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no content");
  return JSON.parse(args) as T;
}

async function firecrawlReferences(topic: string, chapter: string): Promise<ReviseReference[]> {
  const lovKey = process.env.LOVABLE_API_KEY;
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!lovKey || !fcKey) return fallbackReferences();
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
    if (!res.ok) return fallbackReferences();
    const json = await res.json();
    const items: Array<{ url?: string; title?: string; description?: string }> =
      json?.data?.web ?? json?.data ?? json?.results ?? [];
    const seen = new Set<string>();
    const refs: ReviseReference[] = [];
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
    return refs.length > 0 ? refs : fallbackReferences();
  } catch {
    return fallbackReferences();
  }
}

function fallbackReferences(): ReviseReference[] {
  return [
    { title: "NCERT official textbooks", url: "https://ncert.nic.in/textbook.php", source: "ncert.nic.in" },
    { title: "NCERT official resources", url: "https://ncert.nic.in", source: "ncert.nic.in" },
  ];
}

function fallbackTopicTitles(chapterName: string, subjectName?: string | null): string[] {
  const subject = (subjectName ?? "").toLowerCase();
  const subjectTopic = subject.includes("chem")
    ? "Reactions, equations, and trends"
    : subject.includes("bio")
      ? "Diagrams, terminology, and processes"
      : subject.includes("math")
        ? "Theorems, formulas, and problem patterns"
        : "Laws, formulas, units, and graphs";

  return [
    `${chapterName} overview`,
    "NCERT definitions and key terms",
    "Core concepts and relationships",
    subjectTopic,
    "Important examples from NCERT",
    "Exercise-style problem patterns",
    "Common mistakes to avoid",
    "Last-minute revision checklist",
  ];
}

function buildTopicRows(chapterId: string, titles: string[]) {
  const seen = new Set<string>();
  return titles
    .map((title, i) => {
      const cleanTitle = sanitizeTitle(title) ?? `Topic ${i + 1}`;
      const baseSlug = slugify(cleanTitle) || `topic-${i + 1}`;
      let slug = baseSlug;
      let suffix = 2;
      while (seen.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      seen.add(slug);
      return { chapter_id: chapterId, title: cleanTitle, slug, display_order: i };
    })
    .slice(0, 12);
}

function fallbackRevision(topicTitle: string, chapter: ChapterDetails): Pick<ReviseTopic, "summary" | "key_points" | "formulas" | "refs" | "diagram" | "diagram_caption"> {
  const subject = chapter.subjects?.name ?? "subject";
  const classText = chapter.class_level ? `Class ${chapter.class_level}` : "NCERT";
  const formulas = /math|physics|chem/i.test(subject)
    ? ["Revise the NCERT formulas, symbols, units, reactions, and standard results connected with this topic."]
    : [];

  return {
    summary: `${topicTitle} is an important part of the ${classText} ${subject} chapter "${chapter.name}". Focus on the NCERT definitions, diagrams, examples, and exercise patterns before moving to extra practice. Read the concept in small blocks, connect each term with the chapter objective, and then solve the related NCERT questions. For exam revision, keep the exact meaning of keywords clear, note any formula or process steps, and revise common exceptions separately. This offline note is shown when AI generation is unavailable, so use it as a safe checklist and verify details from your NCERT book or the references below.`,
    key_points: [
      "Start with NCERT definitions and terminology for this topic.",
      "Revise the main concept, process, law, theorem, reaction, or diagram linked to the chapter.",
      "Practice the solved examples and exercise questions from NCERT first.",
      "Mark formulas, units, symbols, exceptions, and conditions separately.",
      "Convert long theory into short recall points for quick revision.",
      "After revision, attempt mixed questions from the same chapter to check retention.",
    ],
    formulas,
    refs: fallbackReferences(),
    diagram: `flowchart TD\n  A["${topicTitle.replace(/"/g, "")}"] --> B["NCERT definitions"]\n  A --> C["Core concept / process"]\n  A --> D["Formulas & conditions"]\n  C --> E["Solved examples"]\n  D --> E\n  E --> F["Exercise practice"]`,
    diagram_caption: "Quick revision map for this topic.",
  };
}

/** Mermaid is strict — keep only what we can safely render. */
function sanitizeDiagram(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value
    .replace(/^\s*```(?:mermaid)?/i, "")
    .replace(/```\s*$/, "")
    .trim()
    .slice(0, 3000);
  if (!code) return null;
  if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|mindmap|erDiagram|timeline)\b/i.test(code)) {
    return null;
  }
  return code;
}


export async function listChapterTopics(
  chapterId: string,
  context: SupabaseContext,
): Promise<{ chapter: { id: string; name: string; class_level: number | null } | null; topics: ReviseTopic[] }> {
  const { data: chapter } = await context.supabase
    .from("chapters")
    .select("id, name, class_level, subject_id")
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter) return { chapter: null, topics: [] };

  const { data: existing } = await context.supabase
    .from("revise_topics")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("display_order");

  if (existing && existing.length > 0) {
    return { chapter, topics: existing as unknown as ReviseTopic[] };
  }

  const { data: subject } = await context.supabase
    .from("subjects")
    .select("name")
    .eq("id", (chapter as ChapterRow).subject_id)
    .maybeSingle();

  let titles = fallbackTopicTitles(chapter.name, subject?.name);
  try {
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
    const aiTitles = (result.topics ?? []).map((topic) => sanitizeTitle(topic.title)).filter(Boolean) as string[];
    if (aiTitles.length > 0) titles = aiTitles;
  } catch (error) {
    if (!isAiGenerationError(error)) throw error;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: inserted, error } = await supabaseAdmin
    .from("revise_topics")
    .upsert(buildTopicRows(chapterId, titles), { onConflict: "chapter_id,slug", ignoreDuplicates: true })
    .select("*")
    .order("display_order");
  if (error) throw error;
  return { chapter, topics: (inserted ?? []) as unknown as ReviseTopic[] };
}

export async function readTopicRevision(topicId: string, context: SupabaseContext): Promise<ReviseTopic> {
  const { data: topic, error } = await context.supabase
    .from("revise_topics")
    .select("*, chapters(name, class_level, subjects(name))")
    .eq("id", topicId)
    .maybeSingle();
  if (error) throw error;
  if (!topic) throw new Error("Topic not found");

  const topicRecord = topic as Record<string, unknown> & { chapters?: ChapterDetails };
  const { chapters, ...rest } = topicRecord;
  // Older notes were generated before diagrams existed — regenerate those once
  // so every topic ends up with a visual.
  if (topicRecord.summary && topicRecord.generated_at && topicRecord.diagram) {
    return rest as unknown as ReviseTopic;
  }

  const chapter = chapters ?? { name: "NCERT", class_level: null, subjects: { name: "subject" } };
  try {
    const ai = await callGemini<{
      summary: string;
      key_points: string[];
      formulas: string[];
      diagram?: string;
      diagram_caption?: string;
    }>(
      `Write a concise NCERT-only revision note for the topic "${topicRecord.title}" from the Class ${chapter.class_level} ${chapter.subjects?.name ?? ""} chapter "${chapter.name}".

Return:
- summary: 120-180 word plain-language explanation, exam-focused.
- key_points: 5-8 crisp bullet points a student must remember.
- formulas: array of important formulas or reactions. STRICT FORMAT: each item MUST be "Label: $latex$" where the maths part is valid LaTeX wrapped in single dollar signs (e.g. "Kinetic energy: $K=\\tfrac{1}{2}mv^2$", "Ideal gas law: $PV=nRT$"). Use \\frac, ^, _, \\times, \\Delta, \\rightarrow for reactions, and never use plain-text symbols like "1/2" or "->". Empty array if none.
- diagram: ONE Mermaid diagram that visually explains this topic (concept map, process flow, classification tree, cycle, or ray/energy flow). Rules: start with "flowchart TD" (or "graph LR", "mindmap", "sequenceDiagram", "stateDiagram-v2"). Every node label MUST be wrapped in double quotes, e.g. A["Ideal gas"] --> B["PV = nRT"]. Use plain text only inside labels — NO LaTeX, no $, no parentheses, no <br>, no emojis, no semicolons. 6-12 nodes maximum. Output raw Mermaid code with no markdown fences.
- diagram_caption: one short line (max 90 chars) describing the diagram.

Do NOT include copyrighted text from any textbook — write in your own words.`,
      {
        type: "object",
        properties: {
          summary: { type: "string" },
          key_points: { type: "array", items: { type: "string" } },
          formulas: { type: "array", items: { type: "string" } },
          diagram: { type: "string" },
          diagram_caption: { type: "string" },
        },
        required: ["summary", "key_points", "formulas", "diagram"],
      },
    );

    const refs = await firecrawlReferences(String(topicRecord.title ?? "Revision"), chapter.name);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("revise_topics")
      .update({
        summary: ai.summary,
        key_points: ai.key_points,
        formulas: ai.formulas,
        diagram: sanitizeDiagram(ai.diagram),
        diagram_caption: sanitizeTitle(ai.diagram_caption),
        refs,
        generated_at: new Date().toISOString(),
      })

      .eq("id", topicId)
      .select("*")
      .maybeSingle();
    if (upErr) throw upErr;
    return updated as unknown as ReviseTopic;
  } catch (error) {
    if (!isAiGenerationError(error)) throw error;
    const fallback = fallbackRevision(String(topicRecord.title ?? "Revision"), chapter);
    return { ...(rest as unknown as ReviseTopic), ...fallback };
  }
}
