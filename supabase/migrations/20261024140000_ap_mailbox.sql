-- AP mailbox intake: where reading the AP mailbox left off (Microsoft Graph
-- delta link), when it last ran, the last error, and a short lock so two runs
-- never read the mailbox at the same time.

alter table public.ap_settings
  add column if not exists mailbox_delta_link text,
  add column if not exists mailbox_checked_at timestamptz,
  add column if not exists mailbox_error text,
  add column if not exists mailbox_lock_until timestamptz;
