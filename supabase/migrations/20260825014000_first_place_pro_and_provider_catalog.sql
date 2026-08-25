-- Sunday Mega Test has exactly one prize: rank #1 receives a one-time
-- seven-day Pro extension. Provider-catalog task identities are also retained
-- so an admin cannot accidentally import the same partner task more than once.

ALTER TABLE public.mega_test_entries
  ADD COLUMN IF NOT EXISTS pro_prize_awarded_at timestamptz;

ALTER TABLE public.mega_access_tasks
  ADD COLUMN IF NOT EXISTS provider_task_id text;

ALTER TABLE public.mega_access_tasks
  DROP CONSTRAINT IF EXISTS mega_access_tasks_provider_task_id_check;
ALTER TABLE public.mega_access_tasks
  ADD CONSTRAINT mega_access_tasks_provider_task_id_check
  CHECK (
    provider_task_id IS NULL
    OR (
      task_type = 'external_link'
      AND char_length(btrim(provider_task_id)) BETWEEN 1 AND 200
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS mega_access_tasks_provider_task_unique
  ON public.mega_access_tasks(provider, provider_task_id)
  WHERE provider_task_id IS NOT NULL;

-- Prevent more than one first place, even if a lifecycle retry races with
-- another worker.
CREATE UNIQUE INDEX IF NOT EXISTS mega_test_entries_one_first_place
  ON public.mega_test_entries(mega_test_id)
  WHERE rank = 1;

-- A non-null timestamp is the durable idempotency marker for the Pro award.
CREATE UNIQUE INDEX IF NOT EXISTS mega_test_entries_one_pro_prize
  ON public.mega_test_entries(mega_test_id)
  WHERE pro_prize_awarded_at IS NOT NULL;

DROP FUNCTION IF EXISTS public.record_mega_test_rank(uuid, integer);
CREATE FUNCTION public.record_mega_test_rank(
  p_entry_id uuid,
  p_rank integer
)
RETURNS TABLE(recorded boolean, duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry public.mega_test_entries%ROWTYPE;
  v_test public.mega_tests%ROWTYPE;
BEGIN
  IF p_rank < 1 THEN RAISE EXCEPTION 'invalid Mega Test rank'; END IF;

  SELECT e.* INTO v_entry
  FROM public.mega_test_entries e
  WHERE e.id = p_entry_id
  FOR UPDATE;
  IF NOT FOUND OR v_entry.access_verified_at IS NULL OR v_entry.score IS NULL THEN
    RAISE EXCEPTION 'eligible submitted Mega Test entry not found';
  END IF;

  SELECT t.* INTO v_test
  FROM public.mega_tests t
  WHERE t.id = v_entry.mega_test_id
  FOR SHARE;
  IF NOT FOUND OR now() < v_test.scheduled_end THEN
    RAISE EXCEPTION 'Mega Test has not ended';
  END IF;

  IF v_entry.rank IS NOT NULL THEN
    IF v_entry.rank = p_rank THEN
      RETURN QUERY SELECT false, true;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Mega Test rank was already finalized';
  END IF;

  IF p_rank = 1 THEN
    -- Rank and Pro are committed in the same transaction. If any statement
    -- fails, neither the rank nor the seven-day extension is retained.
    UPDATE public.users u
    SET is_pro = true,
        pro_since = coalesce(u.pro_since, now()),
        pro_until = greatest(now(), coalesce(u.pro_until, now())) + interval '7 days'
    WHERE u.id = v_entry.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mega Test winner profile not found'; END IF;

    UPDATE public.mega_test_entries
    SET rank = 1,
        pro_prize_awarded_at = now()
    WHERE id = p_entry_id;

    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (
      v_entry.user_id,
      'mega_first_prize',
      'You won the Sunday Mega Test',
      'First prize awarded: your Pro access was extended by 7 days.',
      '/battle/mega'
    );
  ELSE
    UPDATE public.mega_test_entries
    SET rank = p_rank
    WHERE id = p_entry_id;
  END IF;

  RETURN QUERY SELECT true, false;
END;
$$;

REVOKE ALL ON FUNCTION public.record_mega_test_rank(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_mega_test_rank(uuid, integer)
  TO service_role;

COMMENT ON COLUMN public.mega_test_entries.pro_prize_awarded_at IS
  'Idempotency marker for the only Sunday Mega Test prize: rank #1 gets 7 days of Pro.';
COMMENT ON COLUMN public.mega_access_tasks.provider_task_id IS
  'External provider catalog identity retained to prevent duplicate task imports.';
