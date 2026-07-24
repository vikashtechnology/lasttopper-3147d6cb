
-- =====================================================
-- ROLES
-- =====================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ur read own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

CREATE POLICY "ur admin read all" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed first admin by email (works even if user hasn't signed up yet — retriable at signup via trigger below)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE email = 'vikashraoa2343@gmail.com'
ON CONFLICT DO NOTHING;

-- Trigger to auto-grant admin on signup for the bootstrap email
CREATE OR REPLACE FUNCTION public.grant_bootstrap_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email = 'vikashraoa2343@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;$$;
REVOKE EXECUTE ON FUNCTION public.grant_bootstrap_admin() FROM PUBLIC, authenticated;
CREATE TRIGGER on_auth_user_bootstrap_admin AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_bootstrap_admin();

-- =====================================================
-- USERS: reputation, ban
-- =====================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reputation INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- Allow public read of limited profile info via a policy (needed for community pages)
CREATE POLICY "users public read" ON public.users FOR SELECT TO authenticated USING (true);

-- Allow admins to update any user (ban, etc.)
CREATE POLICY "users admin update" ON public.users FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- FORUMS
-- =====================================================
CREATE TABLE public.forum_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forum_categories TO anon, authenticated;
GRANT ALL ON public.forum_categories TO service_role;
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fc read all" ON public.forum_categories FOR SELECT USING (true);
CREATE POLICY "fc admin write" ON public.forum_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.forum_categories (slug, name, description, display_order) VALUES
  ('general', 'General', 'Anything and everything', 1),
  ('jee', 'JEE / PCM', 'Physics, Chemistry, Maths discussion', 2),
  ('neet', 'NEET / PCB', 'Physics, Chemistry, Biology discussion', 3),
  ('off-topic', 'Off-topic', 'Non-study chit chat', 4)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE public.forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.forum_categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  upvote_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_posts TO authenticated;
GRANT SELECT ON public.forum_posts TO anon;
GRANT ALL ON public.forum_posts TO service_role;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp read all" ON public.forum_posts FOR SELECT USING (true);
CREATE POLICY "fp insert own" ON public.forum_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_banned = true));
CREATE POLICY "fp update own" ON public.forum_posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fp admin all" ON public.forum_posts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "fp delete own" ON public.forum_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.forum_posts (category_id, created_at DESC);

CREATE TABLE public.forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  upvote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_replies TO authenticated;
GRANT SELECT ON public.forum_replies TO anon;
GRANT ALL ON public.forum_replies TO service_role;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr read all" ON public.forum_replies FOR SELECT USING (true);
CREATE POLICY "fr insert own" ON public.forum_replies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_banned = true));
CREATE POLICY "fr update own" ON public.forum_replies FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fr delete own" ON public.forum_replies FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "fr admin all" ON public.forum_replies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX ON public.forum_replies (post_id, created_at);

-- votes: generic across posts & replies
CREATE TABLE public.forum_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','reply')),
  target_id UUID NOT NULL,
  value SMALLINT NOT NULL DEFAULT 1 CHECK (value IN (1,-1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);
GRANT SELECT, INSERT, DELETE ON public.forum_votes TO authenticated;
GRANT ALL ON public.forum_votes TO service_role;
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fv read own" ON public.forum_votes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "fv write own" ON public.forum_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fv delete own" ON public.forum_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- vote count triggers
CREATE OR REPLACE FUNCTION public.forum_vote_update_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delta INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN delta := NEW.value;
  ELSIF TG_OP = 'DELETE' THEN delta := -OLD.value;
  ELSE RETURN NULL; END IF;
  IF COALESCE(NEW.target_type, OLD.target_type) = 'post' THEN
    UPDATE public.forum_posts SET upvote_count = upvote_count + delta WHERE id = COALESCE(NEW.target_id, OLD.target_id);
  ELSE
    UPDATE public.forum_replies SET upvote_count = upvote_count + delta WHERE id = COALESCE(NEW.target_id, OLD.target_id);
  END IF;
  RETURN NULL;
END;$$;
REVOKE EXECUTE ON FUNCTION public.forum_vote_update_counts() FROM PUBLIC, authenticated;
CREATE TRIGGER trg_forum_vote_ins AFTER INSERT ON public.forum_votes FOR EACH ROW EXECUTE FUNCTION public.forum_vote_update_counts();
CREATE TRIGGER trg_forum_vote_del AFTER DELETE ON public.forum_votes FOR EACH ROW EXECUTE FUNCTION public.forum_vote_update_counts();

-- reply count trigger
CREATE OR REPLACE FUNCTION public.forum_reply_update_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_posts SET reply_count = reply_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_posts SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;$$;
REVOKE EXECUTE ON FUNCTION public.forum_reply_update_count() FROM PUBLIC, authenticated;
CREATE TRIGGER trg_forum_reply_count AFTER INSERT OR DELETE ON public.forum_replies FOR EACH ROW EXECUTE FUNCTION public.forum_reply_update_count();

-- =====================================================
-- DOUBTS
-- =====================================================
CREATE TABLE public.doubts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
  image_url TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  upvote_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doubts TO authenticated;
GRANT SELECT ON public.doubts TO anon;
GRANT ALL ON public.doubts TO service_role;
ALTER TABLE public.doubts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "d read all" ON public.doubts FOR SELECT USING (true);
CREATE POLICY "d insert own" ON public.doubts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_banned = true));
CREATE POLICY "d update own" ON public.doubts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "d delete own" ON public.doubts FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "d admin all" ON public.doubts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX ON public.doubts (created_at DESC);

CREATE TABLE public.doubt_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doubt_id UUID NOT NULL REFERENCES public.doubts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  image_url TEXT,
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  upvote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doubt_replies TO authenticated;
GRANT SELECT ON public.doubt_replies TO anon;
GRANT ALL ON public.doubt_replies TO service_role;
ALTER TABLE public.doubt_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dr read all" ON public.doubt_replies FOR SELECT USING (true);
CREATE POLICY "dr insert own" ON public.doubt_replies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_banned = true));
CREATE POLICY "dr update own" ON public.doubt_replies FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dr delete own" ON public.doubt_replies FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dr admin all" ON public.doubt_replies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
-- Owner of the parent doubt may also update replies (to mark accepted)
CREATE POLICY "dr owner mark accepted" ON public.doubt_replies FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.doubts WHERE id = doubt_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.doubts WHERE id = doubt_id AND user_id = auth.uid()));

CREATE INDEX ON public.doubt_replies (doubt_id, created_at);

-- doubt reply counter trigger + reputation on accepted
CREATE OR REPLACE FUNCTION public.doubt_reply_update_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.doubts SET reply_count = reply_count + 1 WHERE id = NEW.doubt_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.doubts SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.doubt_id;
  END IF;
  RETURN NULL;
END;$$;
REVOKE EXECUTE ON FUNCTION public.doubt_reply_update_count() FROM PUBLIC, authenticated;
CREATE TRIGGER trg_doubt_reply_count AFTER INSERT OR DELETE ON public.doubt_replies
  FOR EACH ROW EXECUTE FUNCTION public.doubt_reply_update_count();

CREATE OR REPLACE FUNCTION public.doubt_reply_accept_rep()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_accepted = true AND (OLD.is_accepted IS DISTINCT FROM true) THEN
    UPDATE public.users SET reputation = reputation + 10 WHERE id = NEW.user_id;
    UPDATE public.doubts SET resolved = true WHERE id = NEW.doubt_id;
  END IF;
  RETURN NEW;
END;$$;
REVOKE EXECUTE ON FUNCTION public.doubt_reply_accept_rep() FROM PUBLIC, authenticated;
CREATE TRIGGER trg_doubt_reply_accept AFTER UPDATE ON public.doubt_replies
  FOR EACH ROW EXECUTE FUNCTION public.doubt_reply_accept_rep();

-- =====================================================
-- STUDY GROUPS
-- =====================================================
CREATE TABLE public.study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  member_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_groups TO authenticated;
GRANT ALL ON public.study_groups TO service_role;
ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.study_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.study_group_members TO authenticated;
GRANT ALL ON public.study_group_members TO service_role;
ALTER TABLE public.study_group_members ENABLE ROW LEVEL SECURITY;

-- security-definer to break recursion between groups <-> members policies
CREATE OR REPLACE FUNCTION public.is_group_member(_group UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.study_group_members WHERE group_id = _group AND user_id = _user)
$$;
REVOKE EXECUTE ON FUNCTION public.is_group_member(UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID,UUID) TO authenticated, service_role;

CREATE POLICY "sg read public or member" ON public.study_groups FOR SELECT TO authenticated
  USING (is_private = false OR public.is_group_member(id, auth.uid()) OR owner_id = auth.uid());
CREATE POLICY "sg insert own" ON public.study_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "sg update owner" ON public.study_groups FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "sg delete owner" ON public.study_groups FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "sgm read visible" ON public.study_group_members FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.study_groups WHERE id = group_id AND (is_private = false OR owner_id = auth.uid())));
CREATE POLICY "sgm join self" ON public.study_group_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.study_groups WHERE id = group_id AND is_private = false));
CREATE POLICY "sgm leave self" ON public.study_group_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- member count triggers
CREATE OR REPLACE FUNCTION public.sg_member_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.study_groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.study_groups SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.group_id; END IF;
  RETURN NULL;
END;$$;
REVOKE EXECUTE ON FUNCTION public.sg_member_count() FROM PUBLIC, authenticated;
CREATE TRIGGER trg_sg_member_count AFTER INSERT OR DELETE ON public.study_group_members FOR EACH ROW EXECUTE FUNCTION public.sg_member_count();

-- auto-add owner as member
CREATE OR REPLACE FUNCTION public.sg_add_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.study_group_members (group_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;$$;
REVOKE EXECUTE ON FUNCTION public.sg_add_owner() FROM PUBLIC, authenticated;
CREATE TRIGGER trg_sg_add_owner AFTER INSERT ON public.study_groups FOR EACH ROW EXECUTE FUNCTION public.sg_add_owner();

CREATE TABLE public.study_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.study_group_messages TO authenticated;
GRANT ALL ON public.study_group_messages TO service_role;
ALTER TABLE public.study_group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sgmsg read member" ON public.study_group_messages FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "sgmsg insert member" ON public.study_group_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "sgmsg delete own" ON public.study_group_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.study_group_messages (group_id, created_at);

-- =====================================================
-- FOLLOWS + ACTIVITY
-- =====================================================
CREATE TABLE public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows read all" ON public.follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "follows insert self" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows delete self" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

CREATE TABLE public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ae read all" ON public.activity_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "ae insert self" ON public.activity_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.activity_events (created_at DESC);
CREATE INDEX ON public.activity_events (user_id, created_at DESC);

-- =====================================================
-- NOTIFICATIONS (in-app)
-- =====================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif read own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notif update own" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notif delete own" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.notifications (user_id, created_at DESC);

-- =====================================================
-- BADGES
-- =====================================================
CREATE TABLE public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.badges TO anon, authenticated;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "b read all" ON public.badges FOR SELECT USING (true);

INSERT INTO public.badges (slug,name,description,icon) VALUES
  ('first-blood','First Blood','Complete your first quiz','🎯'),
  ('century','Century','Answer 100 questions correctly','💯'),
  ('sharpshooter','Sharpshooter','Achieve 90%+ accuracy in a quiz','🏹'),
  ('streak-master','Streak Master','Maintain a 7-day streak','🔥'),
  ('doubt-solver','Doubt Solver','Have 5 accepted doubt answers','🧠')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);
GRANT SELECT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ub read all" ON public.user_badges FOR SELECT TO authenticated USING (true);

-- =====================================================
-- POST REPORTS (moderation)
-- =====================================================
CREATE TABLE public.post_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('forum_post','forum_reply','doubt','doubt_reply')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.post_reports TO authenticated;
GRANT ALL ON public.post_reports TO service_role;
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr insert self" ON public.post_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "pr read own" ON public.post_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "pr admin all" ON public.post_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =====================================================
-- REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_replies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.doubt_replies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
