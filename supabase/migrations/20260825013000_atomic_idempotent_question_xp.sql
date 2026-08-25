-- Make question XP increments atomic and idempotent.
-- All awards are correlated to a server-owned source record; browser roles cannot
-- create ledger entries or execute the award function directly.

CREATE TABLE IF NOT EXISTS public.question_xp_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (
    source_type IN ('battle', 'daily_challenge', 'quiz_session', 'review')
  ),
  source_id uuid NOT NULL,
  source_version integer NOT NULL DEFAULT 1 CHECK (source_version > 0),
  correct_count integer NOT NULL CHECK (correct_count >= 0),
  xp_gained integer NOT NULL CHECK (xp_gained >= 0),
  xp_after integer NOT NULL CHECK (xp_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id, source_version)
);

CREATE INDEX IF NOT EXISTS question_xp_awards_user_created_idx
  ON public.question_xp_awards(user_id, created_at DESC);

ALTER TABLE public.question_xp_awards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS question_xp_awards_select_own ON public.question_xp_awards;
CREATE POLICY question_xp_awards_select_own
  ON public.question_xp_awards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.question_xp_awards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.question_xp_awards TO authenticated;
GRANT ALL ON TABLE public.question_xp_awards TO service_role;

CREATE OR REPLACE FUNCTION public.award_question_xp(
  p_user_id uuid,
  p_correct_count integer,
  p_source_type text,
  p_source_id uuid,
  p_source_version integer DEFAULT 1
)
RETURNS TABLE (
  gained integer,
  xp integer,
  boost integer,
  tier_up boolean,
  tier text,
  awarded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_existing public.question_xp_awards%ROWTYPE;
  v_before integer;
  v_after integer;
  v_gained integer := 0;
  v_boost integer;
  v_multiplier integer;
  v_before_tier text;
  v_after_tier text;
  v_i integer;
BEGIN
  IF p_user_id IS NULL OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'Invalid XP award identity';
  END IF;
  IF p_source_type NOT IN ('battle', 'daily_challenge', 'quiz_session', 'review') THEN
    RAISE EXCEPTION 'Invalid XP source';
  END IF;
  IF p_correct_count IS NULL OR p_correct_count < 0 OR p_correct_count > 200 THEN
    RAISE EXCEPTION 'Invalid correct count';
  END IF;
  IF p_source_version IS NULL OR p_source_version <= 0 THEN
    RAISE EXCEPTION 'Invalid XP source version';
  END IF;

  SELECT *
  INTO v_user
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.question_xp_awards a
  WHERE a.user_id = p_user_id
    AND a.source_type = p_source_type
    AND a.source_id = p_source_id
    AND a.source_version = p_source_version;
  IF FOUND THEN
    RETURN QUERY SELECT
      0,
      COALESCE(v_user.reputation, 0),
      CASE WHEN v_user.is_pro THEN 2 ELSE 1 END,
      false,
      CASE
        WHEN COALESCE(v_user.reputation, 0) >= 100000 THEN 'diamond'
        WHEN COALESCE(v_user.reputation, 0) >= 10000 THEN 'platinum'
        WHEN COALESCE(v_user.reputation, 0) >= 1000 THEN 'gold'
        WHEN COALESCE(v_user.reputation, 0) >= 100 THEN 'silver'
        ELSE 'bronze'
      END,
      false;
    RETURN;
  END IF;

  v_before := GREATEST(COALESCE(v_user.reputation, 0), 0);
  v_after := v_before;
  v_boost := CASE WHEN v_user.is_pro THEN 2 ELSE 1 END;
  v_before_tier := CASE
    WHEN v_before >= 100000 THEN 'diamond'
    WHEN v_before >= 10000 THEN 'platinum'
    WHEN v_before >= 1000 THEN 'gold'
    WHEN v_before >= 100 THEN 'silver'
    ELSE 'bronze'
  END;

  FOR v_i IN 1..p_correct_count LOOP
    v_multiplier := CASE
      WHEN v_after >= 100000 THEN 16
      WHEN v_after >= 10000 THEN 8
      WHEN v_after >= 1000 THEN 4
      WHEN v_after >= 100 THEN 2
      ELSE 1
    END;
    v_gained := v_gained + (10 * v_multiplier * v_boost);
    v_after := v_after + (10 * v_multiplier * v_boost);
  END LOOP;

  UPDATE public.users
  SET reputation = v_after
  WHERE id = p_user_id;

  INSERT INTO public.question_xp_awards (
    user_id,
    source_type,
    source_id,
    source_version,
    correct_count,
    xp_gained,
    xp_after
  ) VALUES (
    p_user_id,
    p_source_type,
    p_source_id,
    p_source_version,
    p_correct_count,
    v_gained,
    v_after
  );

  v_after_tier := CASE
    WHEN v_after >= 100000 THEN 'diamond'
    WHEN v_after >= 10000 THEN 'platinum'
    WHEN v_after >= 1000 THEN 'gold'
    WHEN v_after >= 100 THEN 'silver'
    ELSE 'bronze'
  END;

  RETURN QUERY SELECT
    v_gained,
    v_after,
    v_boost,
    v_before_tier <> v_after_tier,
    v_after_tier,
    true;
END;
$$;

REVOKE ALL ON FUNCTION public.award_question_xp(uuid, integer, text, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_question_xp(uuid, integer, text, uuid, integer)
  TO service_role;

-- Grade one due review and award its XP in the same transaction. A transient
-- XP failure rolls the review mutation back instead of creating an unrepairable
-- gap after the item has moved to a future due date or has been retired.
CREATE OR REPLACE FUNCTION public.grade_review_item(
  p_item_id uuid,
  p_user_id uuid,
  p_correct boolean
)
RETURNS TABLE (
  retired boolean,
  box integer,
  due_at timestamptz,
  xp_gained integer,
  xp_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.review_items%ROWTYPE;
  v_version integer;
  v_box integer;
  v_due_at timestamptz;
  v_xp_gained integer := 0;
  v_xp_total integer := 0;
BEGIN
  SELECT r.* INTO v_item
  FROM public.review_items r
  WHERE r.id = p_item_id AND r.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_item.due_at > now() THEN
    RAISE EXCEPTION 'Review item is not due';
  END IF;

  v_version := coalesce(v_item.reviewed_count, 0) + 1;
  v_box := CASE WHEN p_correct THEN least(5, coalesce(v_item.box, 1) + 1) ELSE 1 END;
  v_due_at := now() + CASE v_box
    WHEN 1 THEN interval '1 day'
    WHEN 2 THEN interval '3 days'
    WHEN 3 THEN interval '7 days'
    WHEN 4 THEN interval '16 days'
    ELSE interval '35 days'
  END;

  IF p_correct AND v_box >= 5 THEN
    DELETE FROM public.review_items WHERE id = v_item.id;
    retired := true;
  ELSE
    UPDATE public.review_items
    SET box = v_box,
        due_at = v_due_at,
        last_result = CASE WHEN p_correct THEN 'correct' ELSE 'wrong' END,
        reviewed_count = v_version
    WHERE id = v_item.id;
    retired := false;
  END IF;

  IF p_correct THEN
    SELECT a.gained, a.xp INTO v_xp_gained, v_xp_total
    FROM public.award_question_xp(p_user_id, 1, 'review', p_item_id, v_version) a;
  END IF;

  box := v_box;
  due_at := v_due_at;
  xp_gained := coalesce(v_xp_gained, 0);
  xp_total := coalesce(v_xp_total, 0);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.grade_review_item(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grade_review_item(uuid, uuid, boolean)
  TO service_role;

-- Keep practice papers and authoritative submission fields server-owned.
ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS xp_eligible boolean NOT NULL DEFAULT false;

REVOKE ALL ON TABLE public.generated_questions FROM anon, authenticated;
REVOKE ALL ON TABLE public.question_bank FROM anon, authenticated;
REVOKE ALL ON TABLE public.quiz_sessions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.review_items FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_quiz_session(
  p_session_id uuid,
  p_user_id uuid,
  p_answers jsonb,
  p_allow_late boolean DEFAULT false
)
RETURNS TABLE (
  submitted boolean,
  correct_count integer,
  incorrect_count integer,
  total integer,
  accuracy numeric,
  elapsed_seconds integer,
  xp_eligible boolean,
  xp_gained integer,
  xp_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.quiz_sessions%ROWTYPE;
  v_question jsonb;
  v_question_id text;
  v_total integer := 0;
  v_correct integer := 0;
  v_incorrect integer := 0;
  v_accuracy numeric := 0;
  v_elapsed integer := 0;
  v_xp_gained integer := 0;
  v_xp_total integer := 0;
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid quiz submission identity';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Invalid answers';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_answers)) > 200 THEN
    RAISE EXCEPTION 'Too many answers';
  END IF;

  SELECT *
  INTO v_session
  FROM public.quiz_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.user_id <> p_user_id THEN
    RAISE EXCEPTION 'Quiz session not found';
  END IF;

  v_total := COALESCE(jsonb_array_length(v_session.questions), 0);
  IF v_session.submitted_at IS NOT NULL THEN
    IF COALESCE(v_session.xp_eligible, false) THEN
      SELECT a.gained, a.xp INTO v_xp_gained, v_xp_total
      FROM public.award_question_xp(
        p_user_id,
        COALESCE(v_session.correct_count, 0),
        'quiz_session',
        p_session_id,
        1
      ) a;
    END IF;

    RETURN QUERY SELECT
      false,
      COALESCE(v_session.correct_count, 0),
      COALESCE(v_session.incorrect_count, v_total - COALESCE(v_session.correct_count, 0)),
      v_total,
      COALESCE(v_session.accuracy, 0),
      COALESCE(v_session.time_taken_seconds, 0),
      COALESCE(v_session.xp_eligible, false),
      COALESCE(v_xp_gained, 0),
      COALESCE(v_xp_total, 0);
    RETURN;
  END IF;

  IF v_total <= 0 OR v_total > 200 THEN
    RAISE EXCEPTION 'Invalid quiz paper';
  END IF;
  IF v_total < COALESCE(v_session.question_count, v_total) THEN
    RAISE EXCEPTION 'Quiz paper is not ready';
  END IF;

  v_elapsed := GREATEST(0, floor(extract(epoch FROM (clock_timestamp() - v_session.start_time)))::integer);
  IF COALESCE(v_session.timer_enabled, false)
    AND v_session.duration_seconds IS NOT NULL
    AND NOT p_allow_late
    AND clock_timestamp() > v_session.start_time
      + make_interval(secs => v_session.duration_seconds + 15)
  THEN
    RAISE EXCEPTION 'Quiz deadline has passed';
  END IF;

  FOR v_question IN
    SELECT value FROM jsonb_array_elements(v_session.questions)
  LOOP
    v_question_id := v_question ->> 'id';
    IF v_question_id IS NOT NULL
      AND p_answers ? v_question_id
      AND p_answers ->> v_question_id = v_question ->> 'correct'
    THEN
      v_correct := v_correct + 1;
    END IF;
  END LOOP;

  v_incorrect := v_total - v_correct;
  v_accuracy := CASE
    WHEN v_total > 0 THEN round((v_correct::numeric / v_total::numeric) * 100, 2)
    ELSE 0
  END;

  UPDATE public.quiz_sessions
  SET answers = p_answers,
      score = v_correct,
      correct_count = v_correct,
      incorrect_count = v_incorrect,
      accuracy = v_accuracy,
      time_taken_seconds = CASE
        WHEN COALESCE(v_session.timer_enabled, false) AND v_session.duration_seconds IS NOT NULL
          THEN LEAST(v_elapsed, v_session.duration_seconds)
        ELSE v_elapsed
      END,
      submitted_at = clock_timestamp(),
      last_heartbeat = clock_timestamp(),
      was_auto_submitted = p_allow_late
  WHERE id = v_session.id;

  IF COALESCE(v_session.xp_eligible, false) THEN
    SELECT a.gained, a.xp INTO v_xp_gained, v_xp_total
    FROM public.award_question_xp(
      p_user_id,
      v_correct,
      'quiz_session',
      p_session_id,
      1
    ) a;
  END IF;

  RETURN QUERY SELECT
    true,
    v_correct,
    v_incorrect,
    v_total,
    v_accuracy,
    CASE
      WHEN COALESCE(v_session.timer_enabled, false) AND v_session.duration_seconds IS NOT NULL
        THEN LEAST(v_elapsed, v_session.duration_seconds)
      ELSE v_elapsed
    END,
    COALESCE(v_session.xp_eligible, false),
    COALESCE(v_xp_gained, 0),
    COALESCE(v_xp_total, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_quiz_session(uuid, uuid, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_session(uuid, uuid, jsonb, boolean)
  TO service_role;
