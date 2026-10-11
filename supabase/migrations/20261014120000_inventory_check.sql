-- Inventory Check: NetSuite vs the warehouse system (ShipHero at BrandFox),
-- per SKU, per ships-from location. Nightly + on demand; every check is
-- kept (400 days) so a difference can be dated when disputing with the 3PL.
-- Replaces the NetSuite-only "NS Inventory Sync" (inventory_levels).
-- Written by the server (service role) only; admins read.

create table if not exists public.inventory_checks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public."Locations"(id) on delete cascade,
  checked_at timestamptz not null default now(),
  trigger text not null check (trigger in ('manual', 'nightly')),
  checked_by uuid,
  warehouses text[] not null default '{}',
  error text
);

create index if not exists inventory_checks_location_idx
  on public.inventory_checks (location_id, checked_at desc);

create table if not exists public.inventory_check_lines (
  check_id uuid not null references public.inventory_checks(id) on delete cascade,
  sku text not null,
  name text,
  in_catalog boolean not null default false,
  ns_on_hand numeric,
  ns_available numeric,
  ns_committed numeric,
  wms_on_hand numeric,
  wms_available numeric,
  wms_allocated numeric,
  wms_non_sellable numeric,
  wms_kit boolean not null default false,
  primary key (check_id, sku)
);

alter table public.inventory_checks enable row level security;
alter table public.inventory_check_lines enable row level security;

create policy inventory_checks_admin_read on public.inventory_checks
  for select to authenticated using (auth_is_admin());
create policy inventory_check_lines_admin_read on public.inventory_check_lines
  for select to authenticated using (auth_is_admin());

-- The NetSuite-only snapshot it replaces (read only by the removed page).
drop table if exists public.inventory_levels;
