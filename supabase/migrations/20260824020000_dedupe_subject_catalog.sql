-- Remove legacy placeholder subjects that duplicate a populated subject catalog.
-- These rows have no chapters and make Learning/Revision show duplicate, empty subjects.
DELETE FROM public.subjects AS placeholder
WHERE NOT EXISTS (
  SELECT 1
  FROM public.chapters AS own_chapter
  WHERE own_chapter.subject_id = placeholder.id
)
AND EXISTS (
  SELECT 1
  FROM public.subjects AS populated
  WHERE populated.id <> placeholder.id
    AND populated.profession = placeholder.profession
    AND lower(trim(populated.name)) = lower(trim(placeholder.name))
    AND EXISTS (
      SELECT 1
      FROM public.chapters AS populated_chapter
      WHERE populated_chapter.subject_id = populated.id
    )
);

-- Subject names are user-facing identities within each exam track. Codes may differ,
-- but two rows with the same normalized name/profession create duplicate UI sections.
CREATE UNIQUE INDEX IF NOT EXISTS subjects_profession_normalized_name_uidx
  ON public.subjects (profession, lower(trim(name)));
