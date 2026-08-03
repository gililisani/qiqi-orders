-- Per-admin two-factor requirement (owner request 2026-08-03, MFA Phase 1.5)
--
-- An admins:manage admin can "push" 2FA: flip mfa_required on another admin.
-- The admin layout then forces that admin into /admin/security enrollment
-- before they can use any other admin page. Client-side gate for now — the
-- server-side aal2 enforcement is Phase 2, after all admins are enrolled.
--
-- Apply order: SQL first (the layout and edit form read/write the column).

alter table public.admins
  add column if not exists mfa_required boolean not null default false;

comment on column public.admins.mfa_required is
  'When true and the admin has no verified MFA factor, the admin layout forces enrollment at /admin/security before any other admin page. Set via the admin edit page (admins:manage).';
