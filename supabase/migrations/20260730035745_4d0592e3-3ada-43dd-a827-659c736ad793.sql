CREATE TABLE public.app_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version text NOT NULL,
  version_code integer NOT NULL DEFAULT 1,
  download_url text NOT NULL,
  notes text,
  mandatory boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_releases TO anon;
GRANT SELECT ON public.app_releases TO authenticated;
GRANT ALL ON public.app_releases TO service_role;

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active releases" ON public.app_releases
FOR SELECT USING (is_active = true);

CREATE POLICY "Admins manage releases" ON public.app_releases
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_app_releases_updated_at
BEFORE UPDATE ON public.app_releases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();