-- Client homepage news box (owner spec 2026-08-04): the old Featured
-- Products box becomes an admin-controlled surface with ONE of five modes:
--   new_release  — title + image + release date + optional link
--   news_scroller — the live announcements list, auto-scrolling upward
--   banner       — a single image or video, nothing else
--   nothing      — box hidden; the activity feed stretches full width
--   latest_dam   — the most recent DAM uploads (4 or 6, whatever fits)
--
-- Singleton config row; scroller content comes from the existing
-- announcements table (window-gated RLS from 20260804120000).
--
-- APPLY ORDER: BEFORE the code deploy.

create table public.client_home_settings (
  id integer primary key default 1 check (id = 1),
  news_mode text not null default 'nothing'
    check (news_mode in ('new_release', 'news_scroller', 'banner', 'nothing', 'latest_dam')),
  release_title text,
  release_image_url text,
  release_date date,
  release_link_url text,
  banner_url text,
  banner_is_video boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.client_home_settings (id) values (1);

alter table public.client_home_settings enable row level security;

create policy client_home_settings_admin_all on public.client_home_settings
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy client_home_settings_read on public.client_home_settings
  for select to authenticated
  using (true);
