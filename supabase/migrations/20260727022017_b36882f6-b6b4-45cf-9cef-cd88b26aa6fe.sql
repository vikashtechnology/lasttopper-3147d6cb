CREATE TABLE public.daily_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_date date NOT NULL,
  profession public.profession NOT NULL,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_date, profession)
);
GRANT SELECT ON public.daily_challenges TO authenticated;
GRANT ALL ON public.daily_challenges TO service_role;
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dc_read" ON public.daily_challenges FOR SELECT TO authenticated USING (true);

CREATE TABLE public.daily_challenge_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.daily_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  session_id uuid,
  correct_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  reward_tc numeric NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.daily_challenge_attempts TO authenticated;
GRANT ALL ON public.daily_challenge_attempts TO service_role;
ALTER TABLE public.daily_challenge_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dca_select_own" ON public.daily_challenge_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dca_insert_own" ON public.daily_challenge_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dca_update_own" ON public.daily_challenge_attempts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_key text NOT NULL,
  chapter_id uuid,
  question jsonb NOT NULL,
  box integer NOT NULL DEFAULT 1,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_result text,
  reviewed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_key)
);
CREATE INDEX review_items_due_idx ON public.review_items (user_id, due_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_items TO authenticated;
GRANT ALL ON public.review_items TO service_role;
ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ri_all_own" ON public.review_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER review_items_updated_at BEFORE UPDATE ON public.review_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS exam text;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS exam_year integer;
CREATE INDEX IF NOT EXISTS question_bank_exam_idx ON public.question_bank (exam, exam_year);