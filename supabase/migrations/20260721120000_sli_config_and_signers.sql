-- =============================================================================
-- SLI config + signers — second brick of the productization/config layer.
--
-- The SLI document's USPPI block, freight/warehouse location, state of origin
-- and signer details were hard-coded in the renderers (SLIDocument.js and
-- sli-nested-tables.html). After the warehouse switch those values went stale.
-- They now live as DATA, editable at /admin/sli/settings:
--
--   1. sli_config   — single row with the USPPI + freight location + state.
--   2. sli_signers  — one row per authorized signee (name, title, contact,
--                     signature image). Exactly one default via partial index.
--   3. slis / standalone_slis get a signer_id so each document remembers who
--      signed it. NULL falls back to the default signer at render time.
--
-- Seeded with the values that were hard-coded until now, so existing documents
-- render identically until the admin edits the settings page.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. sli_config (singleton row, id always 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sli_config (
  id                              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  usppi_name                      TEXT NOT NULL DEFAULT '',
  usppi_address_line1             TEXT NOT NULL DEFAULT '',
  usppi_address_line2             TEXT NOT NULL DEFAULT '',
  usppi_country                   TEXT NOT NULL DEFAULT '',
  usppi_ein                       TEXT NOT NULL DEFAULT '',
  freight_location_name           TEXT NOT NULL DEFAULT '',
  freight_location_address_line1  TEXT NOT NULL DEFAULT '',
  freight_location_address_line2  TEXT NOT NULL DEFAULT '',
  freight_location_country        TEXT NOT NULL DEFAULT '',
  state_of_origin                 TEXT NOT NULL DEFAULT '',
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sli_config IS
  'Singleton config for SLI documents: USPPI block (boxes 1-2, 7), freight location (boxes 3-4), state of origin (box 14). Edited at /admin/sli/settings.';

ALTER TABLE public.sli_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY sli_config_admin_all
  ON public.sli_config FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

INSERT INTO public.sli_config (
  id, usppi_name, usppi_address_line1, usppi_address_line2, usppi_country, usppi_ein,
  freight_location_name, freight_location_address_line1, freight_location_address_line2,
  freight_location_country, state_of_origin
) VALUES (
  1, 'Qiqi INC', '4625 West Nevso Drive, Suite 2', 'Las Vegas, NV 89103', 'United States', '86-2244756',
  'PACKABLE / Webb Enterprises', '1516 Motor Parkway', 'Islandia, New York, 11749',
  'United States', 'NY'
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. sli_signers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sli_signers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  -- App-relative path (seeded legacy image) or a data: URL (uploaded image).
  signature_url  TEXT NOT NULL DEFAULT '',
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sli_signers IS
  'Authorized SLI signees (boxes 42-46). signature_url is an app path or data: URL. One default enforced by partial unique index.';

-- At most one default signer.
CREATE UNIQUE INDEX IF NOT EXISTS sli_signers_single_default
  ON public.sli_signers (is_default) WHERE is_default;

ALTER TABLE public.sli_signers ENABLE ROW LEVEL SECURITY;

CREATE POLICY sli_signers_admin_all
  ON public.sli_signers FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

INSERT INTO public.sli_signers (name, title, email, phone, signature_url, is_default)
SELECT 'Aaron Lisani', 'CPO', 'aaron@qiqiglobal.com', '00972-54-6248884', '/templates/Sig.png', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.sli_signers);

-- ---------------------------------------------------------------------------
-- 3. signer_id on both SLI tables (NULL = use default signer at render time)
-- ---------------------------------------------------------------------------
ALTER TABLE public.slis
  ADD COLUMN IF NOT EXISTS signer_id UUID REFERENCES public.sli_signers(id) ON DELETE SET NULL;

ALTER TABLE public.standalone_slis
  ADD COLUMN IF NOT EXISTS signer_id UUID REFERENCES public.sli_signers(id) ON DELETE SET NULL;
