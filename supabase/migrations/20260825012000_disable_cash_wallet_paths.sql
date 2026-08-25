-- Remove the retired financial and virtual-value schema. Competition and study
-- progress continue through score, rank, XP, streaks, and recognition only.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM anon, authenticated;

DROP TABLE IF EXISTS public.wallet_transactions CASCADE;
DROP TABLE IF EXISTS public.withdrawal_requests CASCADE;
DROP SEQUENCE IF EXISTS public.withdrawal_short_code_seq CASCADE;

ALTER TABLE public.users DROP COLUMN IF EXISTS balance CASCADE;
ALTER TABLE public.daily_challenge_attempts DROP COLUMN IF EXISTS reward_tc CASCADE;
ALTER TABLE public.mega_tests DROP COLUMN IF EXISTS entry_fee CASCADE;
ALTER TABLE public.mega_test_entries DROP COLUMN IF EXISTS paid CASCADE;
ALTER TABLE public.mega_test_entries DROP COLUMN IF EXISTS prize CASCADE;
ALTER TABLE public.mega_test_entries DROP COLUMN IF EXISTS refunded CASCADE;

-- Remove the retired monetary-refund lifecycle state while preserving any
-- historical row as a cancelled competition.
UPDATE public.mega_tests SET status = 'cancelled' WHERE status = 'refunded';
ALTER TABLE public.mega_tests DROP CONSTRAINT IF EXISTS mega_tests_status_check;
ALTER TABLE public.mega_tests
  ADD CONSTRAINT mega_tests_status_check
  CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled'));

-- Competitive papers, registration, results, and study-attempt writes are
-- server-owned. Browser clients may read only their own entry.
REVOKE ALL ON TABLE public.mega_tests FROM anon, authenticated;
REVOKE ALL ON TABLE public.battle_sessions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.mega_test_entries FROM anon, authenticated;
REVOKE ALL ON TABLE public.daily_challenges FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.daily_challenge_attempts FROM anon, authenticated;
DROP POLICY IF EXISTS "mte read all" ON public.mega_test_entries;
DROP POLICY IF EXISTS "own mte select" ON public.mega_test_entries;
CREATE POLICY "own mte select"
  ON public.mega_test_entries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.mega_test_entries
  ADD COLUMN IF NOT EXISTS access_verified_at timestamptz;
UPDATE public.mega_test_entries SET access_verified_at = NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mega_tests_profession_start_unique
  ON public.mega_tests(profession, scheduled_start);

-- Register only when at least one active task is assigned and every assignment
-- has a fresh, verified completion for this user and this Mega Test.
CREATE OR REPLACE FUNCTION public.register_free_mega_test(
  p_mega_test_id uuid,
  p_user_id uuid
)
RETURNS TABLE(registered boolean, already_registered boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_test public.mega_tests%ROWTYPE;
  v_entry public.mega_test_entries%ROWTYPE;
  v_required integer;
  v_incomplete integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_mega_test_id::text || ':' || p_user_id::text, 0));

  SELECT t.* INTO v_test
  FROM public.mega_tests t
  WHERE t.id = p_mega_test_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mega Test not found'; END IF;
  IF v_test.status <> 'scheduled' OR now() >= v_test.scheduled_start THEN
    RAISE EXCEPTION 'Mega Test registration closed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.profession = v_test.profession
  ) THEN
    RAISE EXCEPTION 'student is not eligible for this Mega Test';
  END IF;

  SELECT count(*)::integer INTO v_required
  FROM public.mega_access_task_assignments a
  WHERE a.mega_test_id = p_mega_test_id;
  IF v_required = 0 THEN
    RAISE EXCEPTION 'Mega Test registration is locked until an admin assigns access tasks';
  END IF;

  SELECT count(*)::integer INTO v_incomplete
  FROM public.mega_access_task_assignments a
  JOIN public.mega_access_tasks t ON t.id = a.task_id
  WHERE a.mega_test_id = p_mega_test_id
    AND (
      t.is_active IS DISTINCT FROM true
      OR NOT EXISTS (
        SELECT 1
        FROM public.mega_access_task_attempts x
        WHERE x.assignment_id = a.id
          AND x.user_id = p_user_id
          AND x.status = 'completed'
          AND x.completed_at >= a.assigned_at
          AND x.completed_at < v_test.scheduled_start
      )
    );
  IF v_incomplete > 0 THEN
    RAISE EXCEPTION 'Complete every assigned Mega Test task before registering';
  END IF;

  SELECT e.* INTO v_entry
  FROM public.mega_test_entries e
  WHERE e.mega_test_id = p_mega_test_id AND e.user_id = p_user_id
  FOR UPDATE;
  IF FOUND AND v_entry.access_verified_at IS NOT NULL THEN
    RETURN QUERY SELECT false, true;
    RETURN;
  END IF;

  INSERT INTO public.mega_test_entries(
    mega_test_id, user_id, access_verified_at
  ) VALUES (
    p_mega_test_id, p_user_id, now()
  )
  ON CONFLICT (mega_test_id, user_id) DO UPDATE
  SET access_verified_at = EXCLUDED.access_verified_at;

  RETURN QUERY SELECT true, false;
END;
$$;

REVOKE ALL ON FUNCTION public.register_free_mega_test(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_free_mega_test(uuid, uuid)
  TO service_role;

-- Atomically create (or return) the one Mega Test session linked to a free,
-- server-created registration. The paper remains inside trusted database/server
-- paths; browser clients never receive the answer key.
CREATE OR REPLACE FUNCTION public.start_mega_battle_session(
  p_mega_test_id uuid,
  p_user_id uuid
)
RETURNS TABLE(session_id uuid, existing boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry public.mega_test_entries%ROWTYPE;
  v_test public.mega_tests%ROWTYPE;
  v_session_id uuid;
BEGIN
  SELECT e.* INTO v_entry
  FROM public.mega_test_entries e
  WHERE e.mega_test_id = p_mega_test_id AND e.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_entry.access_verified_at IS NULL THEN
    RAISE EXCEPTION 'Mega Test registration not found';
  END IF;

  SELECT t.* INTO v_test
  FROM public.mega_tests t
  WHERE t.id = p_mega_test_id
  FOR SHARE;
  IF NOT FOUND OR v_test.status IN ('completed', 'cancelled')
     OR now() < v_test.scheduled_start OR now() >= v_test.scheduled_end THEN
    RAISE EXCEPTION 'Mega Test is not live';
  END IF;
  IF v_test.questions IS NULL OR jsonb_typeof(v_test.questions) <> 'array'
     OR jsonb_array_length(v_test.questions) <> coalesce(v_test.question_count, 0)
     OR coalesce(v_test.question_count, 0) <= 0 THEN
    RAISE EXCEPTION 'Mega Test questions are unavailable or incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.mega_access_task_assignments a
    WHERE a.mega_test_id = p_mega_test_id
  ) OR EXISTS (
    SELECT 1
    FROM public.mega_access_task_assignments a
    JOIN public.mega_access_tasks t ON t.id = a.task_id
    WHERE a.mega_test_id = p_mega_test_id
      AND (
        t.is_active IS DISTINCT FROM true
        OR NOT EXISTS (
          SELECT 1 FROM public.mega_access_task_attempts x
          WHERE x.assignment_id = a.id
            AND x.user_id = p_user_id
            AND x.status = 'completed'
            AND x.completed_at >= a.assigned_at
            AND x.completed_at < v_test.scheduled_start
        )
      )
  ) THEN
    RAISE EXCEPTION 'Mega Test access tasks are incomplete';
  END IF;
  IF v_entry.session_id IS NOT NULL THEN
    RETURN QUERY SELECT v_entry.session_id, true;
    RETURN;
  END IF;

  INSERT INTO public.battle_sessions (
    user_id, mode, profession, mega_test_id, questions
  ) VALUES (
    p_user_id, 'mega', v_test.profession, p_mega_test_id, v_test.questions
  ) RETURNING id INTO v_session_id;

  UPDATE public.mega_test_entries
  SET session_id = v_session_id
  WHERE id = v_entry.id;

  RETURN QUERY SELECT v_session_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.start_mega_battle_session(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_mega_battle_session(uuid, uuid)
  TO service_role;

-- Atomically score and finalize a battle from the locked server-owned paper.
-- Elapsed time is derived from database timestamps, never from the browser.
CREATE OR REPLACE FUNCTION public.submit_battle_result(
  p_session_id uuid,
  p_user_id uuid,
  p_answers jsonb
)
RETURNS TABLE(
  submitted boolean,
  already_submitted boolean,
  score integer,
  correct_count integer,
  total integer,
  time_taken_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.battle_sessions%ROWTYPE;
  v_test public.mega_tests%ROWTYPE;
  v_question_count integer;
  v_correct_count integer;
  v_score integer;
  v_time_taken integer;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'invalid battle answers';
  END IF;

  SELECT s.* INTO v_session
  FROM public.battle_sessions s
  WHERE s.id = p_session_id AND s.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle session not found'; END IF;

  IF v_session.questions IS NULL OR jsonb_typeof(v_session.questions) <> 'array' THEN
    RAISE EXCEPTION 'battle questions unavailable';
  END IF;
  v_question_count := jsonb_array_length(v_session.questions);

  IF v_session.submitted_at IS NOT NULL THEN
    RETURN QUERY SELECT
      false,
      true,
      v_session.score,
      v_session.correct_count,
      v_question_count,
      v_session.time_taken_seconds;
    RETURN;
  END IF;

  IF v_session.mode = 'mega' THEN
    SELECT t.* INTO v_test
    FROM public.mega_tests t
    WHERE t.id = v_session.mega_test_id
    FOR SHARE;
    IF NOT FOUND OR v_test.status IN ('completed', 'cancelled')
       OR now() < v_test.scheduled_start OR now() >= v_test.scheduled_end THEN
      RAISE EXCEPTION 'Mega Test submission window closed';
    END IF;

    PERFORM 1
    FROM public.mega_test_entries e
    WHERE e.mega_test_id = v_session.mega_test_id
      AND e.user_id = p_user_id
      AND e.session_id = p_session_id
      AND e.access_verified_at IS NOT NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'linked Mega Test entry not found'; END IF;
  ELSIF v_session.mode NOT IN ('quick', '1v1') THEN
    RAISE EXCEPTION 'invalid battle mode';
  END IF;

  SELECT count(*)::integer INTO v_correct_count
  FROM jsonb_array_elements(v_session.questions) AS question
  WHERE p_answers ->> (question ->> 'id') = question ->> 'correct';
  v_score := v_correct_count * 10;
  v_time_taken := greatest(0, floor(extract(epoch FROM (now() - v_session.start_time)))::integer);

  UPDATE public.battle_sessions
  SET answers = p_answers,
      score = v_score,
      correct_count = v_correct_count,
      time_taken_seconds = v_time_taken,
      submitted_at = now()
  WHERE id = p_session_id;

  IF v_session.mode = 'mega' THEN
    UPDATE public.mega_test_entries
    SET score = v_score, correct_count = v_correct_count
    WHERE mega_test_id = v_session.mega_test_id
      AND user_id = p_user_id
      AND session_id = p_session_id;
  END IF;

  RETURN QUERY SELECT
    true, false, v_score, v_correct_count, v_question_count, v_time_taken;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_battle_result(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_battle_result(uuid, uuid, jsonb)
  TO service_role;

-- Score the current IST daily challenge exactly once.
DROP FUNCTION IF EXISTS public.complete_daily_challenge(uuid, uuid, jsonb);
CREATE FUNCTION public.complete_daily_challenge(
  p_challenge_id uuid,
  p_user_id uuid,
  p_answers jsonb
)
RETURNS TABLE(
  submitted boolean,
  already_submitted boolean,
  correct_count integer,
  total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_challenge public.daily_challenges%ROWTYPE;
  v_attempt public.daily_challenge_attempts%ROWTYPE;
  v_correct integer;
  v_total integer;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'invalid daily challenge answers';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_challenge_id::text || ':' || p_user_id::text, 0)
  );

  SELECT c.* INTO v_challenge
  FROM public.daily_challenges c
  WHERE c.id = p_challenge_id
  FOR SHARE;
  IF NOT FOUND OR v_challenge.challenge_date <> (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'daily challenge unavailable';
  END IF;
  IF jsonb_typeof(v_challenge.questions) <> 'array' THEN
    RAISE EXCEPTION 'daily challenge paper unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.profession = v_challenge.profession
  ) THEN
    RAISE EXCEPTION 'daily challenge user is ineligible';
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.daily_challenge_attempts a
  WHERE a.challenge_id = p_challenge_id AND a.user_id = p_user_id
  FOR UPDATE;
  IF FOUND AND v_attempt.completed_at IS NOT NULL THEN
    RETURN QUERY SELECT
      false, true, v_attempt.correct_count, v_attempt.total_count;
    RETURN;
  END IF;

  v_total := jsonb_array_length(v_challenge.questions);
  SELECT count(*)::integer INTO v_correct
  FROM jsonb_array_elements(v_challenge.questions) AS question
  WHERE p_answers ->> (question ->> 'id') = question ->> 'correct';

  INSERT INTO public.daily_challenge_attempts (
    challenge_id, user_id, correct_count, total_count, completed_at
  ) VALUES (
    p_challenge_id, p_user_id, v_correct, v_total, now()
  )
  ON CONFLICT (challenge_id, user_id) DO UPDATE SET
    correct_count = EXCLUDED.correct_count,
    total_count = EXCLUDED.total_count,
    completed_at = EXCLUDED.completed_at;

  RETURN QUERY SELECT true, false, v_correct, v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_daily_challenge(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_challenge(uuid, uuid, jsonb)
  TO service_role;

-- Persist deterministic rank only.
DROP FUNCTION IF EXISTS public.award_mega_test_result(uuid, integer, numeric);
CREATE OR REPLACE FUNCTION public.record_mega_test_rank(
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

  UPDATE public.mega_test_entries
  SET rank = p_rank
  WHERE id = p_entry_id;

  RETURN QUERY SELECT true, false;
END;
$$;

REVOKE ALL ON FUNCTION public.record_mega_test_rank(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_mega_test_rank(uuid, integer)
  TO service_role;
