ALTER TABLE public.revise_topics
  ADD COLUMN IF NOT EXISTS diagram TEXT,
  ADD COLUMN IF NOT EXISTS diagram_caption TEXT;