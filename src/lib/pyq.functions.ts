import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { QuizQuestion } from "@/lib/learning.functions";

export type PyqOption = { exam: string; year: number | null; count: number };

export const getPyqOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PyqOption[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await context.supabase
      .from("users")
      .select("profession")
      .eq("id", context.userId)
      .maybeSingle();
    const profession = profile?.profession ?? null;

    let q = supabaseAdmin
      .from("question_bank")
      .select("exam, exam_year")
      .not("exam", "is", null)
      .limit(5000);
    if (profession) q = q.or(`profession.eq.${profession},profession.is.null`);
    const { data } = await q;

    const map = new Map<string, PyqOption>();
    for (const r of data ?? []) {
      const exam = (r.exam as string | null)?.toUpperCase();
      if (!exam) continue;
      const year = (r.exam_year as number | null) ?? null;
      const key = `${exam}_${year ?? "all"}`;
      const cur = map.get(key) ?? { exam, year, count: 0 };
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort(
      (a, b) => a.exam.localeCompare(b.exam) || (b.year ?? 0) - (a.year ?? 0),
    );
  });

export const startPyqQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        exam: z.string().min(1).max(40),
        year: z.number().int().nullable(),
        count: z.number().int().min(5).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await context.supabase
      .from("users")
      .select("profession, is_pro")
      .eq("id", context.userId)
      .maybeSingle();
    if (data.count > 20 && !profile?.is_pro) throw new Error("PRO_REQUIRED");
    const profession = profile?.profession ?? null;

    let q = supabaseAdmin
      .from("question_bank")
      .select("id, chapter_id, question, options, correct, hint, explanation")
      .ilike("exam", data.exam)
      .limit(Math.max(data.count * 4, 60));
    if (data.year !== null) q = q.eq("exam_year", data.year);
    if (profession) q = q.or(`profession.eq.${profession},profession.is.null`);
    const { data: pool, error } = await q;
    if (error) throw error;
    if (!pool || pool.length === 0)
      throw new Error("No past-year questions available for that selection yet.");

    const questions: QuizQuestion[] = [...pool]
      .sort(() => Math.random() - 0.5)
      .slice(0, data.count)
      .map((r, i) => ({
        id: `pyq_${Date.now()}_${i}`,
        chapter_id: (r.chapter_id as string) ?? "",
        question: r.question as string,
        options: r.options as QuizQuestion["options"],
        correct: r.correct as QuizQuestion["correct"],
        hint: (r.hint as string) ?? "",
        explanation: (r.explanation as string) ?? "",
      }));

    let chapterIds = Array.from(new Set(questions.map((x) => x.chapter_id))).filter(Boolean);
    if (chapterIds.length === 0) {
      const { data: subjects } = await context.supabase
        .from("subjects")
        .select("id")
        .eq("profession", (profession ?? "pcm") as "pcm" | "pcb")
        .limit(1);
      const { data: ch } = await context.supabase
        .from("chapters")
        .select("id")
        .in(
          "subject_id",
          (subjects ?? []).map((s) => s.id),
        )
        .limit(1);
      chapterIds = (ch ?? []).map((c) => c.id as string);
    }

    const nowIso = new Date().toISOString();
    const { data: row, error: iErr } = await supabaseAdmin
      .from("quiz_sessions")
      .insert({
        user_id: context.userId,
        chapter_ids: chapterIds,
        question_count: questions.length,
        questions: questions as unknown as never,
        timer_enabled: false,
        duration_seconds: null,
        start_time: nowIso,
        last_heartbeat: nowIso,
      })
      .select("id")
      .single();
    if (iErr) throw iErr;
    return { id: row.id as string, count: questions.length };
  });
