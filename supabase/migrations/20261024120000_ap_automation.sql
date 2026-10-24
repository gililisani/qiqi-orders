-- Accounts Payable automation, Phase 1 (docs/AP-AUTOMATION.md).
-- Vendor invoices (ap@ mailbox or Hub upload) are read, matched to the
-- vendor's learned profile, reviewed by an approver and posted to NetSuite
-- as a vendor bill (+ bill payment when already paid).
-- Everything is written by the server (service role); admins read.
-- Business setup lives here as data, not in code (SpinOff-ready).

-- One row: the module's settings.
create table if not exists public.ap_settings (
  id smallint primary key default 1 check (id = 1),
  -- Which NetSuite the module posts to; starts on the sandbox.
  ns_target text not null default 'sandbox' check (ns_target in ('sandbox', 'production')),
  mailbox text,
  -- Admins allowed to approve bills (admins.id).
  approver_ids uuid[] not null default '{}',
  -- Accounts that pay vendor bills, as learned from NetSuite, with the card's
  -- last 4 digits where the account is a card:
  -- [{ ns_account_id, name, type: 'card'|'bank', last4, currency }]
  payment_accounts jsonb not null default '[]',
  learned_at timestamptz,
  learn_summary jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.ap_settings (id) values (1) on conflict do nothing;

-- How each vendor has been booked, learned from its past bills in NetSuite
-- and refined by every approval.
create table if not exists public.ap_vendor_profiles (
  ns_vendor_id text primary key,
  vendor_name text not null,
  subsidiary_id text,
  subsidiary_name text,
  currency text,
  ap_account_id text,
  ap_account_name text,
  -- The coding used on its bills, most common first:
  -- [{ account_id, account_name, department_id, department_name, class_id,
  --    class_name, location_id, location_name, taxcode_id, taxcode_name, share }]
  codings jsonb not null default '[]',
  payment_account_id text,
  payment_account_name text,
  -- "Supabase" in the memo "Supabase 09.26".
  memo_label text,
  bill_count integer not null default 0,
  -- Share of its bill lines that used the most common coding (0..1).
  consistency numeric,
  amount_median numeric,
  amount_min numeric,
  amount_max numeric,
  last_bill_date date,
  -- Sender addresses and names this vendor's invoices arrived with.
  sender_emails text[] not null default '{}',
  aliases text[] not null default '{}',
  source text not null default 'history' check (source in ('history', 'manual')),
  learned_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- One row per invoice document (a PDF attachment, an email body, or an upload).
create table if not exists public.ap_documents (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('email', 'upload')),
  email_message_id text,
  email_from text,
  email_subject text,
  email_received_at timestamptz,
  -- Sender authentication results from the email headers (SPF/DKIM/DMARC).
  email_auth jsonb,
  file_name text,
  mime_type text,
  storage_path text,
  sha256 text,
  bytes integer,
  status text not null default 'received' check (status in (
    'received', 'reading', 'needs_review', 'posting', 'posted',
    'rejected', 'not_invoice', 'unpaid', 'duplicate', 'error'
  )),
  -- What was read from the document, and by which reader.
  extraction jsonb,
  reader text,
  read_at timestamptz,
  -- The proposed (then approved) bill and the checks it passed or failed.
  ns_vendor_id text,
  proposal jsonb,
  checks jsonb,
  invoice_number text,
  invoice_date date,
  total numeric,
  currency text,
  ns_target text,
  ns_bill_id text,
  ns_payment_id text,
  posted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text,
  error text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ap_documents_status_idx on public.ap_documents (status, created_at desc);
create index if not exists ap_documents_created_idx on public.ap_documents (created_at desc);
-- The same file is stored once; the same vendor invoice is posted once.
create unique index if not exists ap_documents_sha256_key on public.ap_documents (sha256) where sha256 is not null;
create unique index if not exists ap_documents_posted_invoice_key
  on public.ap_documents (ns_vendor_id, lower(invoice_number))
  where status = 'posted';
create unique index if not exists ap_documents_email_part_key
  on public.ap_documents (email_message_id, file_name)
  where email_message_id is not null;

-- Audit trail: every step and every human action.
create table if not exists public.ap_events (
  id bigint generated always as identity primary key,
  document_id uuid references public.ap_documents(id) on delete cascade,
  event text not null,
  detail jsonb,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists ap_events_document_idx on public.ap_events (document_id, created_at desc);

alter table public.ap_settings enable row level security;
alter table public.ap_vendor_profiles enable row level security;
alter table public.ap_documents enable row level security;
alter table public.ap_events enable row level security;

create policy ap_settings_admin_read on public.ap_settings
  for select to authenticated using (auth_is_admin());
create policy ap_vendor_profiles_admin_read on public.ap_vendor_profiles
  for select to authenticated using (auth_is_admin());
create policy ap_documents_admin_read on public.ap_documents
  for select to authenticated using (auth_is_admin());
create policy ap_events_admin_read on public.ap_events
  for select to authenticated using (auth_is_admin());

-- Invoice files: private bucket, server access only (the Hub hands out
-- short-lived signed links to view them).
insert into storage.buckets (id, name, public)
  values ('ap-documents', 'ap-documents', false)
  on conflict (id) do nothing;
