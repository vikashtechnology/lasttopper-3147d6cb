
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signup_alert_sent_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON public.users (phone) WHERE phone IS NOT NULL;
