
DROP POLICY IF EXISTS "users public read" ON public.users;

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false, security_barrier = true) AS
SELECT id, full_name, avatar_url, profession, streak, total_accuracy,
       reputation, bio, created_at, is_pro
FROM public.users;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

DROP POLICY IF EXISTS "ae read all" ON public.activity_events;
CREATE POLICY "ae read own" ON public.activity_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "leaderboard read submitted" ON public.battle_sessions;

DROP POLICY IF EXISTS "follows read all" ON public.follows;
CREATE POLICY "follows read own" ON public.follows
  FOR SELECT TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "mte read all" ON public.mega_test_entries;
CREATE POLICY "mte read own" ON public.mega_test_entries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ub read all" ON public.user_badges;
CREATE POLICY "ub read own" ON public.user_badges
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE EXECUTE ON FUNCTION public.doubt_reply_accept_rep() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.doubt_reply_update_count() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.forum_reply_update_count() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.forum_vote_update_counts() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sg_add_owner() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sg_member_count() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_bootstrap_admin() FROM anon, authenticated, PUBLIC;
