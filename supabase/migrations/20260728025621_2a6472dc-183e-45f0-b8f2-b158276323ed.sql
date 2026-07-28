CREATE TABLE public.pro_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  percent integer NOT NULL CHECK (percent BETWEEN 15 AND 25),
  source text NOT NULL DEFAULT 'referral',
  note text,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pro_vouchers TO authenticated;
GRANT ALL ON public.pro_vouchers TO service_role;

ALTER TABLE public.pro_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vouchers"
ON public.pro_vouchers FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX pro_vouchers_user_idx ON public.pro_vouchers (user_id, used_at);