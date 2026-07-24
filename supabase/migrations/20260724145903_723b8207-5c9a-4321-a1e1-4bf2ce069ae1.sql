
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_credited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mega_credits numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users(referred_by);

-- Backfill referral codes for existing rows
UPDATE public.users
SET referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- Extend handle_new_user to seed referral_code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
