
-- Wallet balance on users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0;

-- Wallet transactions
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('credit','debit')),
  category text NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  reference_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wt select" ON public.wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own wt insert" ON public.wallet_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_wt_user_created ON public.wallet_transactions (user_id, created_at DESC);

-- Battle sessions
CREATE TABLE public.battle_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('quick','mega')),
  profession profession,
  mega_test_id uuid,
  questions jsonb NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  time_taken_seconds integer,
  start_time timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.battle_sessions TO authenticated;
GRANT ALL ON public.battle_sessions TO service_role;
ALTER TABLE public.battle_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bs manage" ON public.battle_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "leaderboard read submitted" ON public.battle_sessions FOR SELECT TO authenticated USING (submitted_at IS NOT NULL);
CREATE POLICY "own bs insert" ON public.battle_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own bs update" ON public.battle_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_bs_mode_submitted ON public.battle_sessions (mode, submitted_at DESC);
CREATE INDEX idx_bs_mega ON public.battle_sessions (mega_test_id, score DESC);

-- Mega tests
CREATE TABLE public.mega_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession profession NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','completed','refunded','cancelled')),
  entry_fee numeric NOT NULL DEFAULT 10,
  min_participants integer NOT NULL DEFAULT 50,
  question_count integer NOT NULL DEFAULT 180,
  questions jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mega_tests TO authenticated;
GRANT ALL ON public.mega_tests TO service_role;
ALTER TABLE public.mega_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mega read all" ON public.mega_tests FOR SELECT TO authenticated USING (true);

-- Mega test entries
CREATE TABLE public.mega_test_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mega_test_id uuid NOT NULL REFERENCES public.mega_tests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paid boolean NOT NULL DEFAULT false,
  refunded boolean NOT NULL DEFAULT false,
  session_id uuid,
  score integer,
  correct_count integer,
  rank integer,
  prize numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mega_test_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.mega_test_entries TO authenticated;
GRANT ALL ON public.mega_test_entries TO service_role;
ALTER TABLE public.mega_test_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mte read all" ON public.mega_test_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "mte own insert" ON public.mega_test_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mte own update" ON public.mega_test_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_mte_test_score ON public.mega_test_entries (mega_test_id, score DESC);

-- Withdrawal requests
CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('upi','bank')),
  upi_id text,
  account_name text,
  account_number text,
  ifsc text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed','cancelled')),
  process_after timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wr select" ON public.withdrawal_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own wr insert" ON public.withdrawal_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_wr_pending ON public.withdrawal_requests (status, process_after);

-- Realtime publications for live leaderboards and wallet
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mega_test_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;

-- Extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
