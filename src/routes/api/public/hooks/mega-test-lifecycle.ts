import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { aiChat } from "@/lib/ai-router";
import { authorizeInternalHook, internalHookAuthError } from "@/lib/internal-hook-auth.server";

type MegaQuestion = {
  id: string;
  chapter_id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct: "A" | "B" | "C" | "D";
  hint: string;
  explanation: string;
};

const generatedMegaQuestionSchema = z.object({
  question: z.string().trim().min(1).max(20_000),
  options: z.object({
    A: z.string().max(10_000),
    B: z.string().max(10_000),
    C: z.string().max(10_000),
    D: z.string().max(10_000),
  }),
  correct: z.enum(["A", "B", "C", "D"]),
  hint: z.string().max(10_000).default(""),
  explanation: z.string().max(20_000).default(""),
});

async function callGeminiMega(count: number, batchIdx: number): Promise<MegaQuestion[]> {
  const prompt = `Generate exactly ${count} NCERT-only exam-style MCQ covering ONLY Physics and Chemistry (Class 11 & 12). Mix chapters and difficulty (30/40/30). Use LaTeX ($...$ / $$...$$). This is batch #${batchIdx + 1}; produce a fresh unique set. Return STRICT JSON: {"questions":[{"question":"...","options":{"A":"","B":"","C":"","D":""},"correct":"A|B|C|D","hint":"...","explanation":"..."}]}`;
  try {
    const data = await aiChat({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are an NCERT-only exam question generator. Physics and Chemistry only. Output STRICT JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    const content: string = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = z
      .object({ questions: z.array(generatedMegaQuestionSchema).max(100) })
      .parse(JSON.parse(content));
    return parsed.questions.slice(0, count).map((q, i) => ({
      id: `mq_${Date.now()}_${batchIdx}_${i}`,
      chapter_id: "",
      question: q.question,
      options: q.options,
      correct: q.correct,
      hint: q.hint,
      explanation: q.explanation,
    }));
  } catch {
    return [];
  }
}

async function generateMegaQuestionSet(): Promise<MegaQuestion[]> {
  // 180 questions in 3 parallel batches of 60
  const parts = await Promise.all([
    callGeminiMega(60, 0),
    callGeminiMega(60, 1),
    callGeminiMega(60, 2),
  ]);
  const all = parts.flat().slice(0, 180);
  // Fill incomplete AI output only from Physics/Chemistry bank questions. Never
  // activate a partial paper: every participant must receive all 180 questions.
  if (all.length < 180) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("question_bank")
      .select("id, chapter_id, question, options, correct, hint, explanation")
      .in("subject_code", ["physics_pcm", "physics_pcb", "chemistry_pcm", "chemistry_pcb"])
      .limit(500);
    if (error) throw error;
    const picked = [...(data ?? [])]
      .sort(() => Math.random() - 0.5)
      .flatMap((r, i) => {
        const parsed = generatedMegaQuestionSchema.safeParse(r);
        if (!parsed.success) return [];
        return [
          {
            id: `mq_bank_${Date.now()}_${i}`,
            chapter_id: r.chapter_id ?? "",
            ...parsed.data,
          },
        ];
      })
      .slice(0, 180 - all.length);
    all.push(...picked);
  }
  return all.length === 180 ? all : [];
}

/**
 * Called periodically by pg_cron to:
 *  - persist deterministic ranks for eligible submitted entries
 *  - mark tests as completed
 * Auth: private INTERNAL_HOOK_SECRET via Bearer or X-Internal-Hook-Secret.
 */
export const Route = createFileRoute("/api/public/hooks/mega-test-lifecycle")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }),
      POST: async ({ request }) => {
        const auth = authorizeInternalHook(request);
        if (auth !== "ok") return internalHookAuthError(auth);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { data: tests, error: testsError } = await supabaseAdmin
          .from("mega_tests")
          .select("id")
          .lt("scheduled_end", now)
          .in("status", ["scheduled", "live"]);
        if (testsError) throw testsError;

        const results: Array<{ id: string; action: string }> = [];
        for (const t of tests ?? []) {
          const { data: entries, error: entriesError } = await (supabaseAdmin as any)
            .from("mega_test_entries")
            .select("id, score, correct_count")
            .eq("mega_test_id", t.id)
            .not("access_verified_at", "is", null);
          if (entriesError) throw entriesError;
          const eligibleEntries: Array<{
            id: string;
            score: number | null;
            correct_count: number | null;
          }> = entries ?? [];

          const ranked = eligibleEntries
            .filter((e) => e.score !== null && e.score !== undefined)
            .sort(
              (a, b) =>
                b.score! - a.score! ||
                (b.correct_count ?? 0) - (a.correct_count ?? 0) ||
                a.id.localeCompare(b.id),
            );
          for (let i = 0; i < ranked.length; i += 1) {
            const rank = i + 1;
            const entry = ranked[i];
            // The service-only RPC validates the entry and persists rank atomically.
            const { error: rankError } = await (supabaseAdmin as any).rpc("record_mega_test_rank", {
              p_entry_id: entry.id,
              p_rank: rank,
            });
            if (rankError) throw rankError;
          }

          const { error: completeError } = await supabaseAdmin
            .from("mega_tests")
            .update({ status: "completed" })
            .eq("id", t.id);
          if (completeError) throw completeError;
          results.push({ id: t.id, action: "completed" });
        }

        // Auto-configure next Sunday's mega test.
        // Trigger window: any run after Sunday 14:00 IST (= 08:30 UTC) and before
        // the following Sunday 10:00 IST guarantees the row exists for the
        // upcoming Sunday 10:00 IST start (= 04:30 UTC), for both professions.
        const nowD = new Date();
        function nextSunday1000IST(from: Date): Date {
          for (let i = 0; i < 8; i += 1) {
            const c = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
            c.setUTCHours(4, 30, 0, 0);
            if (c.getUTCDay() === 0 && c.getTime() > from.getTime()) return c;
          }
          return from;
        }
        // Only pre-provision once the current Sunday's window is clearly over (>= 14:00 IST Sunday, or any later day).
        const isSunday = nowD.getUTCDay() === 0;
        const past2pmIST = nowD.getUTCHours() * 60 + nowD.getUTCMinutes() >= 8 * 60 + 30; // 08:30 UTC = 14:00 IST
        const shouldProvision = !isSunday || past2pmIST;
        if (shouldProvision) {
          const start = nextSunday1000IST(nowD);
          const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
          for (const profession of ["pcm", "pcb"] as const) {
            const { data: existing, error: existingError } = await supabaseAdmin
              .from("mega_tests")
              .select("id")
              .eq("profession", profession)
              .eq("scheduled_start", start.toISOString())
              .maybeSingle();
            if (existingError) throw existingError;
            if (!existing) {
              const { error: insertError } = await supabaseAdmin.from("mega_tests").upsert(
                {
                  profession,
                  scheduled_start: start.toISOString(),
                  scheduled_end: end.toISOString(),
                  status: "scheduled",
                  min_participants: 50,
                  question_count: 180,
                },
                { onConflict: "profession,scheduled_start", ignoreDuplicates: true },
              );
              if (insertError) throw insertError;
              results.push({ id: `${profession}-${start.toISOString()}`, action: "provisioned" });
            }
          }

          // Pre-generate ONE shared question set for the upcoming test (Physics + Chemistry
          // only — common to both PCM and PCB per product decision). Save it to both
          // profession rows so every joiner sees the exact same paper.
          const { data: rows, error: rowsError } = await supabaseAdmin
            .from("mega_tests")
            .select("id, questions")
            .eq("scheduled_start", start.toISOString());
          if (rowsError) throw rowsError;
          const needsGen = (rows ?? []).some(
            (r) => !r.questions || (r.questions as unknown[]).length === 0,
          );
          // Only build the paper within 24h of the scheduled start (fresher questions,
          // and avoids burning AI credits a week early).
          const within24h = start.getTime() - nowD.getTime() <= 24 * 60 * 60 * 1000;
          if (needsGen && within24h) {
            const questions = await generateMegaQuestionSet();
            if (questions.length === 180) {
              for (const r of rows ?? []) {
                const { error: questionsError } = await supabaseAdmin
                  .from("mega_tests")
                  .update({ questions: questions as unknown as never })
                  .eq("id", r.id);
                if (questionsError) throw questionsError;
              }
              results.push({
                id: `mega-questions-${start.toISOString()}`,
                action: `generated-${questions.length}`,
              });
            }
          }
        }

        return Response.json({ ok: true, results });
      },
    },
  },
});
