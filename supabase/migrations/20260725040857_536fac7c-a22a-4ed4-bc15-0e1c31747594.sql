
ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS short_code BIGINT;
CREATE SEQUENCE IF NOT EXISTS public.withdrawal_short_code_seq START WITH 100000;
ALTER TABLE public.withdrawal_requests ALTER COLUMN short_code SET DEFAULT nextval('public.withdrawal_short_code_seq');
UPDATE public.withdrawal_requests SET short_code = nextval('public.withdrawal_short_code_seq') WHERE short_code IS NULL;
ALTER TABLE public.withdrawal_requests ALTER COLUMN short_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_short_code_key ON public.withdrawal_requests(short_code);
