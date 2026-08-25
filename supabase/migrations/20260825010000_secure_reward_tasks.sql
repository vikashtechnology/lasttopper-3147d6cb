-- Mega Test access tasks. Every verified completion belongs to one user and
-- one specific Mega Test and cannot be reused.

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS xp_eligible boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.mega_access_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL CHECK (
    task_type IN ('rewarded_ad', 'external_link', 'daily_challenge', 'quiz')
  ),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  provider text CHECK (
    provider IS NULL OR provider ~ '^[a-z0-9][a-z0-9_-]{1,39}$'
  ),
  provider_placement_id text,
  destination_url text,
  min_score_percent smallint NOT NULL DEFAULT 0
    CHECK (min_score_percent BETWEEN 0 AND 100),
  min_questions integer NOT NULL DEFAULT 1
    CHECK (min_questions BETWEEN 1 AND 500),
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (task_type = 'rewarded_ad'
      AND provider = 'admob'
      AND provider_placement_id IS NOT NULL
      AND char_length(btrim(provider_placement_id)) BETWEEN 1 AND 200
      AND destination_url IS NULL)
    OR
    (task_type = 'external_link'
      AND provider IS NOT NULL
      AND provider <> 'admob'
      AND provider_placement_id IS NULL
      AND destination_url IS NOT NULL
      AND char_length(destination_url) <= 1000
      AND destination_url ~ '^https://')
    OR
    (task_type IN ('daily_challenge', 'quiz')
      AND provider IS NULL
      AND provider_placement_id IS NULL
      AND destination_url IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.mega_access_task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mega_test_id uuid NOT NULL REFERENCES public.mega_tests(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.mega_access_tasks(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mega_test_id, task_id)
);

CREATE TABLE IF NOT EXISTS public.mega_access_task_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL
    REFERENCES public.mega_access_task_assignments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'rejected', 'expired')),
  provider text,
  provider_transaction_id text,
  provider_timestamp timestamptz,
  nonce uuid NOT NULL DEFAULT gen_random_uuid(),
  source_type text CHECK (source_type IS NULL OR source_type IN ('daily_challenge', 'quiz')),
  source_id uuid,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  completed_at timestamptz,
  rejection_reason text,
  callback_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND verified_at IS NOT NULL)
    OR status <> 'completed'
  ),
  CHECK (
    (source_type IS NULL AND source_id IS NULL)
    OR (source_type IS NOT NULL AND source_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS mega_access_attempts_provider_tx_unique
  ON public.mega_access_task_attempts(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mega_access_attempts_source_unique
  ON public.mega_access_task_attempts(source_type, source_id)
  WHERE source_id IS NOT NULL AND status = 'completed';
CREATE UNIQUE INDEX IF NOT EXISTS mega_access_attempts_one_completed_unique
  ON public.mega_access_task_attempts(assignment_id, user_id)
  WHERE status = 'completed';
CREATE UNIQUE INDEX IF NOT EXISTS mega_access_attempts_one_pending_provider_unique
  ON public.mega_access_task_attempts(assignment_id, user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS mega_access_assignments_test_idx
  ON public.mega_access_task_assignments(mega_test_id, assigned_at);
CREATE INDEX IF NOT EXISTS mega_access_attempts_user_idx
  ON public.mega_access_task_attempts(user_id, assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mega_access_attempts_expiry_idx
  ON public.mega_access_task_attempts(status, expires_at)
  WHERE status = 'pending';

ALTER TABLE public.mega_access_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mega_access_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mega_access_task_attempts ENABLE ROW LEVEL SECURITY;

-- All access is mediated by authenticated server functions. Provider callbacks
-- and study synchronization use the service role and the RPCs below.
REVOKE ALL ON TABLE public.mega_access_tasks FROM anon, authenticated;
REVOKE ALL ON TABLE public.mega_access_task_assignments FROM anon, authenticated;
REVOKE ALL ON TABLE public.mega_access_task_attempts FROM anon, authenticated;
GRANT ALL ON TABLE public.mega_access_tasks TO service_role;
GRANT ALL ON TABLE public.mega_access_task_assignments TO service_role;
GRANT ALL ON TABLE public.mega_access_task_attempts TO service_role;

DROP TRIGGER IF EXISTS mega_access_tasks_set_updated_at ON public.mega_access_tasks;
CREATE TRIGGER mega_access_tasks_set_updated_at
BEFORE UPDATE ON public.mega_access_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS mega_access_attempts_set_updated_at ON public.mega_access_task_attempts;
CREATE TRIGGER mega_access_attempts_set_updated_at
BEFORE UPDATE ON public.mega_access_task_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Called only after the HTTP endpoint has verified the provider signature over
-- the original callback bytes. It performs identity, assignment, freshness,
-- placement, transaction replay, and deadline checks atomically.
CREATE OR REPLACE FUNCTION public.complete_mega_access_task_attempt(
  p_attempt_id uuid,
  p_nonce uuid,
  p_provider text,
  p_transaction_id text,
  p_provider_timestamp timestamptz,
  p_provider_user_id uuid DEFAULT NULL,
  p_provider_placement_id text DEFAULT NULL,
  p_callback_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  completed boolean,
  already_completed boolean,
  user_id uuid,
  mega_test_id uuid,
  task_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.mega_access_task_attempts%ROWTYPE;
  v_assignment public.mega_access_task_assignments%ROWTYPE;
  v_task public.mega_access_tasks%ROWTYPE;
  v_test public.mega_tests%ROWTYPE;
BEGIN
  IF p_transaction_id IS NULL OR char_length(btrim(p_transaction_id)) = 0
     OR char_length(p_transaction_id) > 300 THEN
    RAISE EXCEPTION 'invalid provider transaction id';
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.mega_access_task_attempts a
  WHERE a.id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task attempt not found'; END IF;

  SELECT ma.* INTO v_assignment
  FROM public.mega_access_task_assignments ma
  WHERE ma.id = v_attempt.assignment_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task assignment not found'; END IF;

  SELECT t.* INTO v_task
  FROM public.mega_access_tasks t
  WHERE t.id = v_assignment.task_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task not found'; END IF;

  SELECT mt.* INTO v_test
  FROM public.mega_tests mt
  WHERE mt.id = v_assignment.mega_test_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mega Test not found'; END IF;

  IF v_attempt.status = 'completed' THEN
    IF v_attempt.nonce = p_nonce
       AND v_attempt.provider = p_provider
       AND v_attempt.provider_transaction_id = p_transaction_id THEN
      RETURN QUERY SELECT false, true, v_attempt.user_id, v_test.id, v_task.id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'completed attempt does not match callback';
  END IF;

  IF v_attempt.status <> 'pending' THEN RAISE EXCEPTION 'task attempt is not pending'; END IF;
  IF v_attempt.nonce <> p_nonce THEN RAISE EXCEPTION 'task attempt nonce mismatch'; END IF;
  IF v_attempt.provider IS DISTINCT FROM p_provider
     OR v_task.provider IS DISTINCT FROM p_provider THEN
    RAISE EXCEPTION 'task provider mismatch';
  END IF;
  IF v_task.task_type NOT IN ('rewarded_ad', 'external_link') THEN
    RAISE EXCEPTION 'task does not accept provider callbacks';
  END IF;
  IF v_task.task_type = 'rewarded_ad' AND (
    p_provider_user_id IS DISTINCT FROM v_attempt.user_id
    OR p_provider_placement_id IS DISTINCT FROM v_task.provider_placement_id
  ) THEN
    RAISE EXCEPTION 'AdMob user or placement mismatch';
  END IF;
  IF v_task.task_type = 'external_link' AND (
    p_provider_user_id IS NOT NULL OR p_provider_placement_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'unexpected external task callback identity';
  END IF;
  IF NOT v_task.is_active THEN RAISE EXCEPTION 'task is inactive'; END IF;
  IF v_test.status <> 'scheduled' OR now() >= v_test.scheduled_start THEN
    RAISE EXCEPTION 'Mega Test task deadline has passed';
  END IF;
  IF now() >= v_attempt.expires_at THEN
    UPDATE public.mega_access_task_attempts
    SET status = 'expired', rejection_reason = 'attempt expired before verification'
    WHERE id = v_attempt.id;
    RETURN QUERY SELECT false, false, v_attempt.user_id, v_test.id, v_task.id;
    RETURN;
  END IF;
  IF p_provider_timestamp IS NULL
     OR p_provider_timestamp < v_attempt.created_at - interval '5 minutes'
     OR p_provider_timestamp > least(v_attempt.expires_at, now() + interval '5 minutes') THEN
    RAISE EXCEPTION 'provider timestamp is outside the attempt window';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.mega_access_task_attempts x
    WHERE x.provider = p_provider
      AND x.provider_transaction_id = p_transaction_id
      AND x.id <> v_attempt.id
  ) THEN
    RAISE EXCEPTION 'provider transaction was already used';
  END IF;

  UPDATE public.mega_access_task_attempts
  SET status = 'completed',
      provider_transaction_id = p_transaction_id,
      provider_timestamp = p_provider_timestamp,
      verified_at = now(),
      completed_at = now(),
      callback_payload = coalesce(p_callback_payload, '{}'::jsonb),
      rejection_reason = NULL
  WHERE id = v_attempt.id;

  RETURN QUERY SELECT true, false, v_attempt.user_id, v_test.id, v_task.id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_mega_access_task_attempt(
  uuid, uuid, text, text, timestamptz, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mega_access_task_attempt(
  uuid, uuid, text, text, timestamptz, uuid, text, jsonb
) TO service_role;

-- Claim one fresh, server-recorded study result for one assignment. The source
-- record has a global unique index so it cannot satisfy another Mega Test.
CREATE OR REPLACE FUNCTION public.record_mega_study_task_completion(
  p_assignment_id uuid,
  p_user_id uuid
)
RETURNS TABLE(
  completed boolean,
  already_completed boolean,
  source_type text,
  source_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment public.mega_access_task_assignments%ROWTYPE;
  v_task public.mega_access_tasks%ROWTYPE;
  v_test public.mega_tests%ROWTYPE;
  v_source_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_assignment_id::text || ':' || p_user_id::text, 0));

  SELECT ma.* INTO v_assignment
  FROM public.mega_access_task_assignments ma
  WHERE ma.id = p_assignment_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task assignment not found'; END IF;

  SELECT t.* INTO v_task
  FROM public.mega_access_tasks t
  WHERE t.id = v_assignment.task_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task not found'; END IF;

  SELECT mt.* INTO v_test
  FROM public.mega_tests mt
  WHERE mt.id = v_assignment.mega_test_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mega Test not found'; END IF;

  SELECT a.source_type, a.source_id
  INTO source_type, source_id
  FROM public.mega_access_task_attempts a
  WHERE a.assignment_id = v_assignment.id
    AND a.user_id = p_user_id
    AND a.status = 'completed'
  LIMIT 1;
  IF FOUND THEN
    completed := false;
    already_completed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT v_task.is_active OR v_task.task_type NOT IN ('daily_challenge', 'quiz') THEN
    RAISE EXCEPTION 'study task is not active';
  END IF;
  IF v_test.status <> 'scheduled' OR now() >= v_test.scheduled_start THEN
    RAISE EXCEPTION 'Mega Test task deadline has passed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.profession = v_test.profession
  ) THEN
    RAISE EXCEPTION 'student is not eligible for this Mega Test';
  END IF;

  IF v_task.task_type = 'daily_challenge' THEN
    SELECT a.id INTO v_source_id
    FROM public.daily_challenge_attempts a
    JOIN public.daily_challenges c ON c.id = a.challenge_id
    WHERE a.user_id = p_user_id
      AND a.completed_at IS NOT NULL
      AND a.completed_at >= v_assignment.assigned_at
      AND a.completed_at < v_test.scheduled_start
      AND c.profession = v_test.profession
      AND a.total_count >= v_task.min_questions
      AND (a.correct_count * 100.0 / greatest(a.total_count, 1)) >= v_task.min_score_percent
      AND NOT EXISTS (
        SELECT 1 FROM public.mega_access_task_attempts used
        WHERE used.source_type = 'daily_challenge'
          AND used.source_id = a.id
          AND used.status = 'completed'
      )
    ORDER BY a.completed_at
    LIMIT 1;
  ELSE
    SELECT q.id INTO v_source_id
    FROM public.quiz_sessions q
    WHERE q.user_id = p_user_id
      AND q.submitted_at IS NOT NULL
      AND q.submitted_at >= v_assignment.assigned_at
      AND q.submitted_at < v_test.scheduled_start
      AND q.xp_eligible IS TRUE
      AND q.question_count >= v_task.min_questions
      AND coalesce(q.accuracy, 0) >= v_task.min_score_percent
      AND NOT EXISTS (
        SELECT 1 FROM public.mega_access_task_attempts used
        WHERE used.source_type = 'quiz'
          AND used.source_id = q.id
          AND used.status = 'completed'
      )
    ORDER BY q.submitted_at
    LIMIT 1;
  END IF;

  IF v_source_id IS NULL THEN
    completed := false;
    already_completed := false;
    source_type := v_task.task_type;
    source_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.mega_access_task_attempts
  SET status = 'expired', rejection_reason = 'replaced by verified study completion'
  WHERE assignment_id = v_assignment.id
    AND user_id = p_user_id
    AND status = 'pending';

  INSERT INTO public.mega_access_task_attempts (
    assignment_id, user_id, status, source_type, source_id, expires_at,
    verified_at, completed_at
  ) VALUES (
    v_assignment.id, p_user_id, 'completed', v_task.task_type, v_source_id,
    v_test.scheduled_start, now(), now()
  );

  completed := true;
  already_completed := false;
  source_type := v_task.task_type;
  source_id := v_source_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.record_mega_study_task_completion(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_mega_study_task_completion(uuid, uuid)
  TO service_role;

COMMENT ON TABLE public.mega_access_tasks IS
  'Admin-created provider or server-verified study requirements for one Mega Test.';
COMMENT ON TABLE public.mega_access_task_assignments IS
  'Binds a required task to exactly one Mega Test registration gate.';
COMMENT ON TABLE public.mega_access_task_attempts IS
  'Replay-safe completion evidence scoped to one assignment, user, and Mega Test.';
