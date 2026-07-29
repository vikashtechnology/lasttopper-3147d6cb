CREATE TABLE public.social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL UNIQUE,
  label text NOT NULL,
  url text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.social_links TO anon;
GRANT SELECT ON public.social_links TO authenticated;
GRANT ALL ON public.social_links TO service_role;
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enabled social links are viewable by everyone"
  ON public.social_links FOR SELECT USING (enabled = true);
CREATE POLICY "Admins can view all social links"
  ON public.social_links FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER social_links_updated_at BEFORE UPDATE ON public.social_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.social_links (platform, label, display_order) VALUES
('youtube','YouTube',1),
('telegram','Telegram',2),
('discord','Discord',3),
('twitter','X (Twitter)',4),
('instagram','Instagram',5),
('whatsapp','WhatsApp',6),
('facebook','Facebook',7),
('linkedin','LinkedIn',8),
('github','GitHub',9),
('website','Website',10);