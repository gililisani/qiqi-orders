-- NetSuite review — admin decisions on NetSuite documents (owner 2026-10-08).
--
-- Hub first: nothing from NetSuite counts on its own. An admin reviews each
-- NetSuite document the Hub doesn't already know (sales_documents, mirrored
-- nightly) and decides:
--   invoices / cash sales with no Hub order
--     outside_sale    — add to the client's sales (billed outside the Hub)
--     attach          — it bills Hub order X (entered in NetSuite by hand);
--                       the order already counts, so this adds nothing
--     ignore          — with a reason (e.g. private label)
--   credit memos / refunds (never support funds)
--     attach          — to the Hub order, or the outside sale, it credits
--     company_credit  — for the company, not tied to one order (rare: a
--                       credit covering two orders)
--     ignore          — with a reason
-- Invoices NetSuite already links to a Hub order (same sales order) need no
-- decision.
--
-- B1 (this migration): decisions are recorded and shown; no report reads
-- them yet. Reports switch per company later, once its review is finished.
--
-- One row per document, keyed by it, so the nightly sync (which keeps each
-- document's id) never touches a decision; a document deleted in NetSuite
-- takes its decision with it. Undoing a decision deletes the row.
--
-- Embeds: nothing embeds this table (code reads it separately). order_id is
-- not part of the primary key, so PostgREST never treats it as a junction
-- between sales_documents and orders (existing embeds stay unambiguous).
--
-- APPLY ORDER: BEFORE the code deploy (the new code reads this table).

create table if not exists public.sales_document_reviews (
  document_id uuid primary key references public.sales_documents(id) on delete cascade,
  decision text not null check (decision in ('outside_sale', 'attach', 'company_credit', 'ignore')),
  order_id uuid references public.orders(id) on delete cascade,
  attached_document_id uuid references public.sales_documents(id) on delete cascade,
  reason text,
  decided_by uuid,
  decided_at timestamptz not null default now(),
  constraint sales_document_reviews_target check (
    case decision
      when 'attach' then (order_id is not null) <> (attached_document_id is not null)
      else order_id is null and attached_document_id is null
    end
  ),
  constraint sales_document_reviews_ignore_reason check (
    decision <> 'ignore' or length(btrim(coalesce(reason, ''))) > 0
  )
);

comment on table public.sales_document_reviews is
  'Admin decision per NetSuite document (NetSuite review page). outside_sale = counts as a sale billed outside the Hub; attach = belongs to a Hub order (order_id) or, for a credit, to an outside sale (attached_document_id); company_credit = a credit for the company not tied to one order; ignore = never counts (reason required). No row = not reviewed yet.';

create index if not exists idx_sales_document_reviews_order
  on public.sales_document_reviews (order_id) where order_id is not null;
create index if not exists idx_sales_document_reviews_attached
  on public.sales_document_reviews (attached_document_id) where attached_document_id is not null;

alter table public.sales_document_reviews enable row level security;

drop policy if exists sales_document_reviews_admin_all on public.sales_document_reviews;
create policy sales_document_reviews_admin_all on public.sales_document_reviews
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());
