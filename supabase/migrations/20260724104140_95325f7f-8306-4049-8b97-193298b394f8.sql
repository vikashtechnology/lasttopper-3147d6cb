
-- generated_questions cache (24h TTL)
CREATE TABLE public.generated_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_ids uuid[] NOT NULL,
  profession text NOT NULL,
  question_count int NOT NULL,
  questions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX idx_gq_user_created ON public.generated_questions (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_questions TO authenticated;
GRANT ALL ON public.generated_questions TO service_role;
ALTER TABLE public.generated_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gq select" ON public.generated_questions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own gq insert" ON public.generated_questions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own gq delete" ON public.generated_questions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- quiz_sessions
CREATE TABLE public.quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_ids uuid[] NOT NULL,
  question_count int NOT NULL,
  questions jsonb NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  timer_enabled boolean NOT NULL DEFAULT false,
  duration_seconds int,
  start_time timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  score int,
  correct_count int,
  incorrect_count int,
  accuracy numeric,
  time_taken_seconds int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_qs_user_created ON public.quiz_sessions (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_sessions TO authenticated;
GRANT ALL ON public.quiz_sessions TO service_role;
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own qs select" ON public.quiz_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own qs insert" ON public.quiz_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own qs update" ON public.quiz_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own qs delete" ON public.quiz_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);
