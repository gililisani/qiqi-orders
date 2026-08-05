-- Client-portal content features (owner requests 2026-08-04):
--   * announcements — admin-controlled homepage news: coming-soon teasers,
--     launches, back-in-stock, offers. Every row has a validity window so
--     nothing on the homepage can ever be stale by construction.
--   * compliance_documents — Regulatory & Compliance library (MSDS, COAs,
--     ingredients, certificates), admin-uploaded, per-product or general,
--     stored in a private bucket, served to partners via signed URLs.
--
-- APPLY ORDER: BEFORE the code deploy (new pages read these tables).

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  type text not null check (type in ('coming_soon', 'launch', 'back_in_stock', 'news', 'offer')),
  product_id bigint references public."Products"(id) on delete set null,
  image_url text,
  starts_at date not null default current_date,
  ends_at date not null,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint announcements_window_valid check (ends_at >= starts_at)
);

alter table public.announcements enable row level security;

create policy announcements_admin_all on public.announcements
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

-- Partners see only enabled rows inside their validity window.
create policy announcements_client_select on public.announcements
  for select to authenticated
  using (enabled and current_date between starts_at and ends_at);

-- ---------------------------------------------------------------------------
-- compliance_documents
-- ---------------------------------------------------------------------------
create table public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Free text on purpose: the admin UI offers the standard set (MSDS, COA,
  -- Ingredients, Certificate, Regulatory, Other) but a new category must
  -- not need a migration.
  category text not null,
  product_id bigint references public."Products"(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  content_type text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index idx_compliance_documents_product on public.compliance_documents (product_id);

alter table public.compliance_documents enable row level security;

create policy compliance_documents_admin_all on public.compliance_documents
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

-- Every partner may see the whole library (MSDS/COAs are meant for them).
create policy compliance_documents_client_select on public.compliance_documents
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Storage: private bucket, admin-write, authenticated-read (signed URLs)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('compliance-docs', 'compliance-docs', false)
on conflict (id) do nothing;

create policy compliance_docs_admin_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compliance-docs' and auth_is_admin());

create policy compliance_docs_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'compliance-docs' and auth_is_admin());

create policy compliance_docs_authenticated_read on storage.objects
  for select to authenticated
  using (bucket_id = 'compliance-docs');
