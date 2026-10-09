-- NetSuite review — credit links + nightly alerts (owner 2026-10-09).
--
-- 1. Credits remember the invoice NetSuite says they credit, so the review
--    page can suggest it. NetSuite's screens don't show it, but its links do
--    (read-only SuiteQL, traced by the nightly sync):
--      created_from               the credit was created from the invoice
--      return_authorization       created from a Return Authorization that
--                                 was created from the invoice
--      return_authorization_order … from a Return Authorization created from
--                                 a sales order → that order's invoice(s),
--                                 narrowed by the credited products
--    "Applied to" (the invoice a credit paid off) is deliberately NOT used:
--    credits are often applied to a later, unrelated invoice.
--    Filled by the next sync (nightly or "Sync now").
--
-- 2. Nightly alert email (Settings → Sales → alert emails): NetSuite
--    documents waiting for a decision, Hub orders NetSuite billed
--    differently, sync failures — each alerted ONCE (sales_review_alerts).
--    The first run only records what already exists (no email), so known
--    items never alert.
--
-- APPLY ORDER: BEFORE the code deploy (the new sync writes these columns).

alter table public.sales_documents
  add column if not exists credited_invoice_ns_ids text[] not null default '{}',
  add column if not exists credited_invoice_tranids text[] not null default '{}',
  add column if not exists credit_link text;

alter table public.sales_documents drop constraint if exists sales_documents_credit_link_check;
alter table public.sales_documents add constraint sales_documents_credit_link_check
  check (credit_link is null or credit_link in ('created_from', 'return_authorization', 'return_authorization_order'));

comment on column public.sales_documents.credited_invoice_ns_ids is
  'Credits only: NetSuite internal ids of the invoice(s) NetSuite links this credit to (created from / via a Return Authorization). Suggestion for the NetSuite review page.';
comment on column public.sales_documents.credited_invoice_tranids is
  'Credits only: the numbers of those invoices (same order as credited_invoice_ns_ids).';
comment on column public.sales_documents.credit_link is
  'Credits only: how NetSuite links it — created_from | return_authorization | return_authorization_order.';

alter table public.sales_settings
  add column if not exists alert_emails text[] not null default '{}';

comment on column public.sales_settings.alert_emails is
  'Who gets the nightly NetSuite review alert (new documents to decide, orders billed differently, sync failures). Empty = no email.';

create table if not exists public.sales_review_alerts (
  key text primary key,
  alerted_at timestamptz not null default now()
);

comment on table public.sales_review_alerts is
  'What the nightly NetSuite review alert already reported (doc:<id>, order:<id>:<state>, sync:<company>:<day>) — each is emailed once.';

alter table public.sales_review_alerts enable row level security;

drop policy if exists sales_review_alerts_admin_all on public.sales_review_alerts;
create policy sales_review_alerts_admin_all on public.sales_review_alerts
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());
