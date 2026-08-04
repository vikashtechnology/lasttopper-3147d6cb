REVOKE SELECT ON public.mega_tests FROM authenticated;
GRANT SELECT (id, profession, scheduled_start, scheduled_end, status, entry_fee, min_participants, question_count, created_at) ON public.mega_tests TO authenticated;
GRANT ALL ON public.mega_tests TO service_role;