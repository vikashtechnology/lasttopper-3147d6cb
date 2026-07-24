
ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz,
  ADD COLUMN IF NOT EXISTS was_auto_submitted boolean NOT NULL DEFAULT false;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_date date,
  ADD COLUMN IF NOT EXISTS last_streak_date date;

CREATE TABLE IF NOT EXISTS public.question_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid,
  question_id text NOT NULL,
  question_text text,
  reason text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.question_reports TO authenticated;
GRANT ALL ON public.question_reports TO service_role;
ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own reports select" ON public.question_reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own reports insert" ON public.question_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
