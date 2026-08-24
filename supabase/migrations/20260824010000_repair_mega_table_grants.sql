-- Restore the table privileges expected by the mega-test RLS policies.
-- This is intentionally idempotent so environments with the original grants
-- and environments that drifted can both apply it safely.
DO $migration$
BEGIN
  IF to_regclass('public.mega_tests') IS NOT NULL THEN
    GRANT SELECT ON TABLE public.mega_tests TO authenticated;
    GRANT ALL PRIVILEGES ON TABLE public.mega_tests TO service_role;
  END IF;

  IF to_regclass('public.mega_test_entries') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.mega_test_entries TO authenticated;
    GRANT ALL PRIVILEGES ON TABLE public.mega_test_entries TO service_role;
  END IF;
END
$migration$;
