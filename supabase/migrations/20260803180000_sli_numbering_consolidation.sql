-- SLI consolidation: order SLIs get SLI numbers (owner decision 2026-08-03)
--
-- Until now only standalone_slis carried sli_number (UNIQUE, from 100000) and
-- only they appeared in /admin/sli/documents — SLIs created against orders
-- were untracked customs paperwork (audit WP5.2). Owner decided order SLIs
-- get numbers and join the documents list. Tables stay separate (a full
-- table merge was considered and deferred: prod data migration + RLS rework
-- for no additional user-visible benefit).
--
-- Also cleans up the abandoned earlier unification attempt inside slis:
-- sli_type / manual_products have zero code references, and the only rows
-- using them are 3 keyboard-mash test rows from 2025-10 (consignee "njghjgfhj",
-- "df", "ccvbcxvb" — no order_id, no pdf_url, invisible to every code path).
--
-- APPLY ORDER (exception to the usual push-first rule): run this SQL BEFORE
-- deploying the code. The new create route inserts sli_number and the new
-- documents list selects it; old schema would reject both (PGRST204).

-- 1. Remove the orphaned test rows so the NOT NULL below holds and the
--    backfill doesn't hand numbers to garbage. Verify first if in doubt:
--      SELECT id, consignee_name FROM slis
--      WHERE sli_type = 'standalone' AND order_id IS NULL;
delete from public.slis
where sli_type = 'standalone' and order_id is null;

-- 2. Drop the dead half-unification columns. slis_client_select (tier-2,
--    20260802150000) used sli_type = 'order' only to hide the stray
--    standalone rows deleted above; with order_id NOT NULL the EXISTS join
--    on orders already scopes every row, so the condition is redundant.
drop policy if exists slis_client_select on public.slis;
alter table public.slis drop column if exists sli_type;
alter table public.slis drop column if exists manual_products;

create policy slis_client_select on public.slis
  for select to authenticated
  using (
    auth_has_permission('orders')
    and exists (
      select 1 from public.orders o
      where o.id = slis.order_id
        and o.company_id = auth_company_id()
    )
  );

-- 3. Every remaining slis row belongs to an order; keep it that way.
alter table public.slis alter column order_id set not null;

-- 4. Number the order SLIs. UNIQUE per table; cross-table uniqueness comes
--    from the shared sequence below (single number space).
alter table public.slis add column if not exists sli_number integer unique;

with numbered as (
  select id,
         row_number() over (order by created_at, id)
           + (select greatest(coalesce(max(sli_number), 99999), 99999)
              from public.standalone_slis)
           as n
  from public.slis
  where sli_number is null
)
update public.slis s
set sli_number = numbered.n
from numbered
where s.id = numbered.id;

alter table public.slis alter column sli_number set not null;

comment on column public.slis.sli_number is
  'Shared number space with standalone_slis.sli_number (both minted by generate_sli_number(), backed by sli_number_seq). Backfilled 2026-08-03 in created_at order.';

-- 5. Backfilled rows never had sli_date set (the PDF fell back to
--    date_of_export). Give existing rows their creation date; the create
--    route stamps it explicitly from here on.
update public.slis set sli_date = created_at::date where sli_date is null;

-- 6. One number space across both tables, race-free. The old function
--    re-read MAX(sli_number) per call — two concurrent creates could mint
--    the same number, and the per-table UNIQUE constraints cannot see across
--    tables. A sequence is concurrency-safe; a create that fails after
--    minting burns a number, which is fine for internal tracking numbers.
create sequence if not exists public.sli_number_seq as integer;

select setval(
  'public.sli_number_seq',
  greatest(
    coalesce((select max(sli_number) from public.standalone_slis), 99999),
    coalesce((select max(sli_number) from public.slis), 99999)
  )
);

create or replace function public.generate_sli_number() returns integer
    language sql
    set search_path to 'public', 'pg_catalog'
    as $$
  SELECT nextval('public.sli_number_seq')::integer;
$$;

-- Only server-side routes (service role) mint numbers.
revoke all on function public.generate_sli_number() from public, anon, authenticated;
grant execute on function public.generate_sli_number() to service_role;
revoke all on sequence public.sli_number_seq from public, anon, authenticated;
grant usage on sequence public.sli_number_seq to service_role;
