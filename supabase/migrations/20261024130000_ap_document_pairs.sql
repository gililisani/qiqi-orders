-- AP: a receipt (or a second copy) that belongs to an invoice already in the
-- inbox is attached to it instead of becoming a second bill. The invoice is
-- the one that gets posted; the attached document supplies payment details
-- (card, date paid) and is attached to the NetSuite bill too.

alter table public.ap_documents
  add column if not exists primary_document_id uuid references public.ap_documents(id) on delete set null;

create index if not exists ap_documents_primary_idx on public.ap_documents (primary_document_id)
  where primary_document_id is not null;

-- How the vendor's memos write the period: 'month' ("Supabase 09.26") or
-- 'range' ("Anthropic 23.09-23.10.26"), learned from its past bills.
alter table public.ap_vendor_profiles
  add column if not exists memo_style text not null default 'month' check (memo_style in ('month', 'range'));

alter table public.ap_documents drop constraint if exists ap_documents_status_check;
alter table public.ap_documents add constraint ap_documents_status_check check (status in (
  'received', 'reading', 'needs_review', 'posting', 'posted',
  'rejected', 'not_invoice', 'unpaid', 'duplicate', 'attached', 'error'
));
