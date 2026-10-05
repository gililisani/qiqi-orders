-- Fulfillment routing — a product setting, not a per-company checkbox
-- (owner 2026-10-05; designed for any NetSuite wholesale tenant).
--
-- Model:
--   * Warehouses = "Locations" (+ active: retired warehouses vanish from
--     every picker but stay on historical orders).
--   * fulfillment_routes: each subsidiary's ONE default "ships from" warehouse.
--   * fulfillment_customer_overrides: optional per-customer exception,
--     honoured only when fulfillment_settings.customer_overrides_enabled.
--   * Cross-subsidiary fulfillment (CSF) is never chosen per company: it is
--     the automatic consequence of shipping from a warehouse owned by another
--     subsidiary — allowed only when fulfillment_settings.cross_subsidiary_enabled.
--   Resolver: lib/fulfillmentRouting.ts (order save + NetSuite push + screens).
--
-- Why module-owned tables instead of new columns on subsidiaries/companies:
-- a second foreign key between two tables that already reference each other
-- makes every un-hinted PostgREST embed between them ambiguous ("more than one
-- relationship was found") — it broke companies→Locations and
-- Locations→subsidiaries joins in testing (2026-10-05). Tables keyed by a
-- single column add no such path, and keep the module self-contained.
--
-- Legacy columns companies.location_id + companies.cross_subsidiary_fulfillment
-- are no longer read or written by the Hub; kept for one release, dropped later.
--
-- No tenant-specific data here. Each tenant sets "ships from" per subsidiary
-- in Settings → Fulfillment. The only seed preserves current behaviour: the
-- CSF switch starts ON when any company already used CSF.
--
-- APPLY ORDER: BEFORE the code deploy. Safe for the code already deployed
-- (it never touches these objects).

alter table public."Locations"
  add column if not exists active boolean not null default true;

comment on column public."Locations".active is
  'false = retired: hidden from every warehouse picker; kept for historical orders (orders.location_id).';

-- ---- Switches (singleton) ----
create table if not exists public.fulfillment_settings (
  id integer primary key default 1 check (id = 1),
  cross_subsidiary_enabled boolean not null default false,
  customer_overrides_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.fulfillment_settings is
  'Singleton: fulfillment routing switches (Settings → Fulfillment).';

insert into public.fulfillment_settings (id, cross_subsidiary_enabled)
select 1, exists (select 1 from public.companies where cross_subsidiary_fulfillment)
on conflict (id) do nothing;

-- ---- Ships from, per subsidiary ----
create table if not exists public.fulfillment_routes (
  subsidiary_id uuid primary key references public.subsidiaries(id) on delete cascade,
  location_id uuid not null references public."Locations"(id),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.fulfillment_routes is
  'Default "ships from" warehouse per subsidiary. A warehouse owned by another subsidiary = cross-subsidiary fulfillment (requires fulfillment_settings.cross_subsidiary_enabled).';

-- ---- Per-customer exceptions ----
create table if not exists public.fulfillment_customer_overrides (
  company_id uuid primary key references public.companies(id) on delete cascade,
  location_id uuid not null references public."Locations"(id),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.fulfillment_customer_overrides is
  'Per-customer warehouse exception; used only when fulfillment_settings.customer_overrides_enabled.';

-- ---- RLS: admin-only (server code uses the service role) ----
alter table public.fulfillment_settings enable row level security;
alter table public.fulfillment_routes enable row level security;
alter table public.fulfillment_customer_overrides enable row level security;

drop policy if exists fulfillment_settings_admin_all on public.fulfillment_settings;
create policy fulfillment_settings_admin_all on public.fulfillment_settings
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists fulfillment_routes_admin_all on public.fulfillment_routes;
create policy fulfillment_routes_admin_all on public.fulfillment_routes
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists fulfillment_customer_overrides_admin_all on public.fulfillment_customer_overrides;
create policy fulfillment_customer_overrides_admin_all on public.fulfillment_customer_overrides
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());
