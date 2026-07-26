CREATE TABLE public.revise_topics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  summary text,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  formulas jsonb NOT NULL DEFAULT '[]'::jsonb,
  refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order int NOT NULL DEFAULT 0,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, slug)
);

CREATE INDEX revise_topics_chapter_idx ON public.revise_topics(chapter_id, display_order);

GRANT SELECT ON public.revise_topics TO authenticated;
GRANT ALL ON public.revise_topics TO service_role;

ALTER TABLE public.revise_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read revise topics"
  ON public.revise_topics FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_revise_topics_updated
  BEFORE UPDATE ON public.revise_topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();