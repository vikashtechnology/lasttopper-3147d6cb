-- Keep official owner access limited to the two approved Google accounts.
-- Existing matching users are promoted immediately; future matching Google
-- sign-ups receive the admin role from the auth.users trigger.

CREATE OR REPLACE FUNCTION public.grant_bootstrap_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(NEW.email) IN (
    'vikashraoa2343@gmail.com',
    'rajkatrina90@gmail.com'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.grant_bootstrap_admin() FROM PUBLIC, anon, authenticated;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) IN (
  'vikashraoa2343@gmail.com',
  'rajkatrina90@gmail.com'
)
ON CONFLICT DO NOTHING;
