create table public.admin_settings (
  key text primary key,
  value text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

grant select, insert, update, delete on public.admin_settings to authenticated;
grant all on public.admin_settings to service_role;

alter table public.admin_settings enable row level security;

create policy "Admins can manage admin_settings"
  on public.admin_settings
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
