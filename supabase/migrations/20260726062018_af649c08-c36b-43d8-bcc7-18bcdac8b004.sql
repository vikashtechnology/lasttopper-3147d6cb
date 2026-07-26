
-- 1) Question bank (fallback when AI credits expire; also holds admin bulk uploads)
CREATE TABLE public.question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profession TEXT,
  subject_code TEXT,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct TEXT NOT NULL CHECK (correct IN ('A','B','C','D')),
  hint TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'ai',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.question_bank TO authenticated;
GRANT ALL ON public.question_bank TO service_role;

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read question bank"
  ON public.question_bank FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage question bank"
  ON public.question_bank FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX question_bank_lookup_idx
  ON public.question_bank(profession, chapter_id);

CREATE INDEX question_bank_chapter_idx
  ON public.question_bank(chapter_id);

-- 2) Daily streak reminder cron (18:30 IST = 13:00 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove previous version if it existed
DO $$ BEGIN
  PERFORM cron.unschedule('daily-streak-reminder');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'daily-streak-reminder',
  '0 13 * * *',
  $$
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT u.id,
         'streak_reminder',
         'Complete your streak today 🔥',
         'You haven''t practiced today. Solve 5 questions to keep your streak alive!',
         '/learning'
    FROM public.users u
   WHERE u.onboarded = true
     AND u.is_banned = false
     AND (u.last_active_date IS NULL OR u.last_active_date < CURRENT_DATE)
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications n
        WHERE n.user_id = u.id
          AND n.kind = 'streak_reminder'
          AND n.created_at > (now() - interval '20 hours')
     );
  $$
);
