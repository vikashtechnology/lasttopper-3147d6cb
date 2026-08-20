
-- Ensure all tables have proper grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.profiles TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
GRANT SELECT ON public.tournaments TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
GRANT SELECT ON public.teams TO anon;

-- Seed some initial data
INSERT INTO public.subjects (name, code, profession) 
VALUES ('Physics', 'PHY', 'pcm'), ('Chemistry', 'CHE', 'pcm'), ('Biology', 'BIO', 'pcb')
ON CONFLICT DO NOTHING;

INSERT INTO public.tournaments (title, description, entry_fee, prize_pool, status, start_date, match_format, max_teams)
VALUES ('Grand Championship', 'Weekly mega tournament for all students.', 100, 5000, 'upcoming', now() + interval '2 days', 'single_elimination', 100)
ON CONFLICT DO NOTHING;
