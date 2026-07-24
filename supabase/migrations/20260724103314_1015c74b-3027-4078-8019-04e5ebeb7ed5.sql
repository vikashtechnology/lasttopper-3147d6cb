
-- Profession enum
CREATE TYPE public.profession AS ENUM ('pcm', 'pcb');

-- USERS TABLE
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  country_code text NOT NULL DEFAULT '+91',
  phone text,
  profession public.profession,
  onboarded boolean NOT NULL DEFAULT false,
  daily_question_limit int NOT NULL DEFAULT 20,
  streak int NOT NULL DEFAULT 0,
  total_accuracy numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON public.users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- SUBJECTS
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  profession public.profession NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, profession)
);
GRANT SELECT ON public.subjects TO authenticated, anon;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects_read_all" ON public.subjects FOR SELECT TO authenticated, anon USING (true);

-- CHAPTERS
CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  class_level int,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chapters TO authenticated, anon;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chapters_read_all" ON public.chapters FOR SELECT TO authenticated, anon USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED SUBJECTS
INSERT INTO public.subjects (code, name, profession, display_order) VALUES
  ('physics_pcm', 'Physics', 'pcm', 1),
  ('chemistry_pcm', 'Chemistry', 'pcm', 2),
  ('mathematics_pcm', 'Mathematics', 'pcm', 3),
  ('physics_pcb', 'Physics', 'pcb', 1),
  ('chemistry_pcb', 'Chemistry', 'pcb', 2),
  ('biology_pcb', 'Biology', 'pcb', 3);

-- SEED CHAPTERS (JEE / NEET standard syllabus)
-- Physics (shared list, seeded per subject row)
WITH phys_chapters(name, class_level, ord) AS (VALUES
  ('Units and Measurements', 11, 1),
  ('Kinematics', 11, 2),
  ('Laws of Motion', 11, 3),
  ('Work, Energy and Power', 11, 4),
  ('System of Particles and Rotational Motion', 11, 5),
  ('Gravitation', 11, 6),
  ('Mechanical Properties of Solids', 11, 7),
  ('Mechanical Properties of Fluids', 11, 8),
  ('Thermal Properties of Matter', 11, 9),
  ('Thermodynamics', 11, 10),
  ('Kinetic Theory', 11, 11),
  ('Oscillations', 11, 12),
  ('Waves', 11, 13),
  ('Electric Charges and Fields', 12, 14),
  ('Electrostatic Potential and Capacitance', 12, 15),
  ('Current Electricity', 12, 16),
  ('Moving Charges and Magnetism', 12, 17),
  ('Magnetism and Matter', 12, 18),
  ('Electromagnetic Induction', 12, 19),
  ('Alternating Current', 12, 20),
  ('Electromagnetic Waves', 12, 21),
  ('Ray Optics and Optical Instruments', 12, 22),
  ('Wave Optics', 12, 23),
  ('Dual Nature of Radiation and Matter', 12, 24),
  ('Atoms', 12, 25),
  ('Nuclei', 12, 26),
  ('Semiconductor Electronics', 12, 27)
)
INSERT INTO public.chapters (subject_id, name, class_level, display_order)
SELECT s.id, p.name, p.class_level, p.ord
FROM public.subjects s CROSS JOIN phys_chapters p
WHERE s.code IN ('physics_pcm', 'physics_pcb');

-- Chemistry (shared)
WITH chem_chapters(name, class_level, ord) AS (VALUES
  ('Some Basic Concepts of Chemistry', 11, 1),
  ('Structure of Atom', 11, 2),
  ('Classification of Elements and Periodicity', 11, 3),
  ('Chemical Bonding and Molecular Structure', 11, 4),
  ('Thermodynamics', 11, 5),
  ('Equilibrium', 11, 6),
  ('Redox Reactions', 11, 7),
  ('Organic Chemistry: Basic Principles', 11, 8),
  ('Hydrocarbons', 11, 9),
  ('Solutions', 12, 10),
  ('Electrochemistry', 12, 11),
  ('Chemical Kinetics', 12, 12),
  ('The d- and f-Block Elements', 12, 13),
  ('Coordination Compounds', 12, 14),
  ('Haloalkanes and Haloarenes', 12, 15),
  ('Alcohols, Phenols and Ethers', 12, 16),
  ('Aldehydes, Ketones and Carboxylic Acids', 12, 17),
  ('Amines', 12, 18),
  ('Biomolecules', 12, 19)
)
INSERT INTO public.chapters (subject_id, name, class_level, display_order)
SELECT s.id, c.name, c.class_level, c.ord
FROM public.subjects s CROSS JOIN chem_chapters c
WHERE s.code IN ('chemistry_pcm', 'chemistry_pcb');

-- Mathematics (PCM only)
WITH math_chapters(name, class_level, ord) AS (VALUES
  ('Sets', 11, 1),
  ('Relations and Functions', 11, 2),
  ('Trigonometric Functions', 11, 3),
  ('Complex Numbers and Quadratic Equations', 11, 4),
  ('Linear Inequalities', 11, 5),
  ('Permutations and Combinations', 11, 6),
  ('Binomial Theorem', 11, 7),
  ('Sequences and Series', 11, 8),
  ('Straight Lines', 11, 9),
  ('Conic Sections', 11, 10),
  ('Introduction to 3D Geometry', 11, 11),
  ('Limits and Derivatives', 11, 12),
  ('Statistics', 11, 13),
  ('Probability', 11, 14),
  ('Matrices', 12, 15),
  ('Determinants', 12, 16),
  ('Continuity and Differentiability', 12, 17),
  ('Application of Derivatives', 12, 18),
  ('Integrals', 12, 19),
  ('Application of Integrals', 12, 20),
  ('Differential Equations', 12, 21),
  ('Vector Algebra', 12, 22),
  ('Three Dimensional Geometry', 12, 23),
  ('Linear Programming', 12, 24)
)
INSERT INTO public.chapters (subject_id, name, class_level, display_order)
SELECT s.id, m.name, m.class_level, m.ord
FROM public.subjects s CROSS JOIN math_chapters m
WHERE s.code = 'mathematics_pcm';

-- Biology (PCB only)
WITH bio_chapters(name, class_level, ord) AS (VALUES
  ('The Living World', 11, 1),
  ('Biological Classification', 11, 2),
  ('Plant Kingdom', 11, 3),
  ('Animal Kingdom', 11, 4),
  ('Morphology of Flowering Plants', 11, 5),
  ('Anatomy of Flowering Plants', 11, 6),
  ('Structural Organisation in Animals', 11, 7),
  ('Cell: The Unit of Life', 11, 8),
  ('Biomolecules', 11, 9),
  ('Cell Cycle and Cell Division', 11, 10),
  ('Photosynthesis in Higher Plants', 11, 11),
  ('Respiration in Plants', 11, 12),
  ('Plant Growth and Development', 11, 13),
  ('Breathing and Exchange of Gases', 11, 14),
  ('Body Fluids and Circulation', 11, 15),
  ('Excretory Products and their Elimination', 11, 16),
  ('Locomotion and Movement', 11, 17),
  ('Neural Control and Coordination', 11, 18),
  ('Chemical Coordination and Integration', 11, 19),
  ('Sexual Reproduction in Flowering Plants', 12, 20),
  ('Human Reproduction', 12, 21),
  ('Reproductive Health', 12, 22),
  ('Principles of Inheritance and Variation', 12, 23),
  ('Molecular Basis of Inheritance', 12, 24),
  ('Evolution', 12, 25),
  ('Human Health and Disease', 12, 26),
  ('Microbes in Human Welfare', 12, 27),
  ('Biotechnology: Principles and Processes', 12, 28),
  ('Biotechnology and its Applications', 12, 29),
  ('Organisms and Populations', 12, 30),
  ('Ecosystem', 12, 31),
  ('Biodiversity and Conservation', 12, 32)
)
INSERT INTO public.chapters (subject_id, name, class_level, display_order)
SELECT s.id, b.name, b.class_level, b.ord
FROM public.subjects s CROSS JOIN bio_chapters b
WHERE s.code = 'biology_pcb';
