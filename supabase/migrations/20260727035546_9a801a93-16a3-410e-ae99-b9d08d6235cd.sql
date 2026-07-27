ALTER TABLE public.users ADD COLUMN IF NOT EXISTS best_streak integer NOT NULL DEFAULT 0;
UPDATE public.users SET best_streak = GREATEST(COALESCE(best_streak,0), COALESCE(streak,0));