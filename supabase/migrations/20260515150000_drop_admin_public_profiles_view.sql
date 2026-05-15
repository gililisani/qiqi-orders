-- Drop the admin_public_profiles view: replaced by a display-layer
-- decision to show "Qiqi" for admin-created orders/notes in client views.
-- The view triggered a security_definer_view advisor error (intentional
-- DEFINER semantics for column-level disclosure), which we no longer
-- need since the UI no longer exposes admin names to clients at all.
DROP VIEW IF EXISTS public.admin_public_profiles;
