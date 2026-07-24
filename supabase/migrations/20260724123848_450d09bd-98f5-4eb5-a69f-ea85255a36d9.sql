ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pro_since timestamptz;