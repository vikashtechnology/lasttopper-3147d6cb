ALTER PUBLICATION supabase_realtime ADD TABLE public.mega_tests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawal_requests;

ALTER TABLE public.battle_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.mega_test_entries REPLICA IDENTITY FULL;
ALTER TABLE public.mega_tests REPLICA IDENTITY FULL;
ALTER TABLE public.wallet_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.withdrawal_requests REPLICA IDENTITY FULL;