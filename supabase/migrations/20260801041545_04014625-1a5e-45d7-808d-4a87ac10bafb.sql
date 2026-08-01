CREATE OR REPLACE FUNCTION public.grant_bootstrap_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email IN ('vikashraoa2343@gmail.com', 'p919919154625@phone.lasttopper.app') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;$function$;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
WHERE email IN ('vikashraoa2343@gmail.com', 'p919919154625@phone.lasttopper.app')
ON CONFLICT DO NOTHING;