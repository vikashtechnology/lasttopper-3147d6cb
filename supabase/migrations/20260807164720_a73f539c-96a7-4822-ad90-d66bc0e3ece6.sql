-- Create app_role enum if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END $$;

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    phone TEXT,
    bgmi_uid TEXT,
    in_game_name TEXT,
    total_winnings INTEGER DEFAULT 0,
    kd_ratio FLOAT DEFAULT 0.0,
    is_verified BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.profiles TO anon;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Teams table
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    captain_id UUID REFERENCES public.profiles(id) NOT NULL,
    team_name TEXT UNIQUE NOT NULL,
    members JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Captains can manage their teams" ON public.teams FOR ALL TO authenticated USING (captain_id = auth.uid());

-- Tournaments table
CREATE TABLE IF NOT EXISTS public.tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    entry_fee INTEGER NOT NULL,
    prize_pool INTEGER NOT NULL,
    max_teams INTEGER NOT NULL,
    registered_teams_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed')),
    scoring_rules JSONB DEFAULT '{"wwcd": 15, "kill": 1, "placement_2nd": 10}'::jsonb,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID REFERENCES public.profiles(id),
    match_format TEXT DEFAULT 'single_elimination' CHECK (match_format IN ('single_elimination', 'double_elimination', 'round_robin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT ON public.tournaments TO authenticated;
GRANT SELECT ON public.tournaments TO anon;
GRANT ALL ON public.tournaments TO service_role;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tournaments" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "Admins can manage tournaments" ON public.tournaments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Registrations table
CREATE TABLE IF NOT EXISTS public.registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.registrations TO authenticated;
GRANT ALL ON public.registrations TO service_role;

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own registrations" ON public.registrations FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.teams 
        WHERE id = team_id AND captain_id = auth.uid()
    )
);
CREATE POLICY "Admins can read all registrations" ON public.registrations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Captains can register teams" ON public.registrations FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.teams 
        WHERE id = team_id AND captain_id = auth.uid()
    )
);

-- Matches table
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    match_number INTEGER NOT NULL,
    room_id TEXT,
    room_password TEXT,
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'live', 'completed')),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Admins can manage matches" ON public.matches FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Match scores table
CREATE TABLE IF NOT EXISTS public.match_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    kills INTEGER DEFAULT 0,
    placement INTEGER,
    total_points INTEGER DEFAULT 0,
    is_winner BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT ON public.match_scores TO authenticated;
GRANT SELECT ON public.match_scores TO anon;
GRANT ALL ON public.match_scores TO service_role;

ALTER TABLE public.match_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read match scores" ON public.match_scores FOR SELECT USING (true);
CREATE POLICY "Admins can manage match scores" ON public.match_scores FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Payouts table
CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    tds_deducted INTEGER DEFAULT 0,
    net_amount INTEGER NOT NULL,
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    upi_transaction_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT ALL ON public.payouts TO service_role;
GRANT SELECT ON public.payouts TO authenticated;

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payouts" ON public.payouts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Captains can see their team payouts" ON public.payouts FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.teams 
        WHERE id = team_id AND captain_id = auth.uid()
    )
);
