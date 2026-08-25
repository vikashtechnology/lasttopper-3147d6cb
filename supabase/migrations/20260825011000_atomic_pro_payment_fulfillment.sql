-- Idempotent, atomic one-time Pro pass fulfillment.

CREATE TABLE IF NOT EXISTS public.pro_payment_fulfillments (
  payment_id text PRIMARY KEY CHECK (char_length(payment_id) BETWEEN 1 AND 100),
  order_id text NOT NULL UNIQUE CHECK (char_length(order_id) BETWEEN 1 AND 100),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('pro_weekly', 'pro', 'pro_yearly')),
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  fulfilled_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pro_payment_fulfillments_user_idx
  ON public.pro_payment_fulfillments(user_id, fulfilled_at DESC);

ALTER TABLE public.pro_payment_fulfillments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_payment_fulfillments FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fulfill_pro_payment(
  p_payment_id text,
  p_order_id text,
  p_user_id uuid,
  p_purpose text,
  p_amount_paise integer
)
RETURNS TABLE (
  fulfilled boolean,
  already_fulfilled boolean,
  pro_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days integer;
  v_expected_amount integer;
  v_inserted text;
  v_until timestamptz;
  v_existing public.pro_payment_fulfillments%ROWTYPE;
BEGIN
  IF p_payment_id IS NULL OR char_length(p_payment_id) NOT BETWEEN 1 AND 100
     OR p_order_id IS NULL OR char_length(p_order_id) NOT BETWEEN 1 AND 100
     OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'invalid payment fulfillment data';
  END IF;
  v_days := CASE p_purpose
    WHEN 'pro_weekly' THEN 7
    WHEN 'pro' THEN 30
    WHEN 'pro_yearly' THEN 365
    ELSE NULL
  END;
  v_expected_amount := CASE p_purpose
    WHEN 'pro_weekly' THEN 4900
    WHEN 'pro' THEN 14900
    WHEN 'pro_yearly' THEN 149900
    ELSE NULL
  END;
  IF v_days IS NULL OR v_expected_amount IS NULL THEN
    RAISE EXCEPTION 'invalid Pro pass purpose';
  END IF;
  IF p_amount_paise <> v_expected_amount THEN
    RAISE EXCEPTION 'invalid Pro pass amount';
  END IF;

  SELECT * INTO v_existing
  FROM public.pro_payment_fulfillments
  WHERE payment_id = p_payment_id OR order_id = p_order_id
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.payment_id <> p_payment_id
       OR v_existing.order_id <> p_order_id
       OR v_existing.user_id <> p_user_id
       OR v_existing.purpose <> p_purpose
       OR v_existing.amount_paise <> p_amount_paise THEN
      RAISE EXCEPTION 'payment replay data mismatch';
    END IF;
    SELECT u.pro_until INTO v_until FROM public.users u WHERE u.id = p_user_id;
    RETURN QUERY SELECT true, true, v_until;
    RETURN;
  END IF;

  -- Lock before inserting so fulfillment and extension are serialized per user.
  PERFORM 1 FROM public.users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment user not found'; END IF;

  INSERT INTO public.pro_payment_fulfillments(payment_id, order_id, user_id, purpose, amount_paise)
  VALUES (p_payment_id, p_order_id, p_user_id, p_purpose, p_amount_paise)
  ON CONFLICT DO NOTHING
  RETURNING payment_id INTO v_inserted;

  IF v_inserted IS NULL THEN
    SELECT * INTO v_existing
    FROM public.pro_payment_fulfillments
    WHERE payment_id = p_payment_id OR order_id = p_order_id
    LIMIT 1;
    IF NOT FOUND
       OR v_existing.payment_id <> p_payment_id
       OR v_existing.order_id <> p_order_id
       OR v_existing.user_id <> p_user_id
       OR v_existing.purpose <> p_purpose
       OR v_existing.amount_paise <> p_amount_paise THEN
      RAISE EXCEPTION 'payment replay data mismatch';
    END IF;
    SELECT u.pro_until INTO v_until FROM public.users u WHERE u.id = p_user_id;
    RETURN QUERY SELECT true, true, v_until;
    RETURN;
  END IF;

  UPDATE public.users u
  SET is_pro = true,
      pro_since = coalesce(u.pro_since, now()),
      pro_until = greatest(now(), coalesce(u.pro_until, now())) + make_interval(days => v_days)
  WHERE u.id = p_user_id
  RETURNING u.pro_until INTO v_until;

  RETURN QUERY SELECT true, false, v_until;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_pro_payment(text, text, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_pro_payment(text, text, uuid, text, integer)
  TO service_role;

COMMENT ON TABLE public.pro_payment_fulfillments IS
  'One row per captured Razorpay payment/order; prevents duplicate Pro-pass extension.';
