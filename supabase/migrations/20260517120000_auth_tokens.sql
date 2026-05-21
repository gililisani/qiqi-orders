-- Custom auth-token tables that replace Supabase's built-in single-use magic-link
-- flow. Email scanners (Microsoft Defender Safe Links, Mimecast, etc.) routinely
-- pre-fetch links in emails and burn single-use tokens before users click them.
-- These tables let us own the token lifecycle: tokens are validated and consumed
-- only on explicit form submit, not on URL load.

-- ---------------------------------------------------------------------------
-- password_setup_tokens — used by both new-user setup and password-reset flows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_setup_tokens (
  token        TEXT PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID, -- admin who triggered the link (nullable; admins table)
  attempts     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_user ON password_setup_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_expires ON password_setup_tokens (expires_at);

ALTER TABLE password_setup_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (via API routes) ever touches this table.
-- Clients/admins never query it directly.

COMMENT ON TABLE password_setup_tokens IS
  'Long random tokens emailed to users for password setup/reset. Owned by application code, not Supabase auth.';

-- ---------------------------------------------------------------------------
-- login_codes — 6-digit one-time login codes for client password-less login
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash    TEXT NOT NULL,                 -- SHA-256 hex of the 6-digit code
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_codes_user ON login_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_login_codes_expires ON login_codes (expires_at);

ALTER TABLE login_codes ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

COMMENT ON TABLE login_codes IS
  '6-digit one-time login codes for clients. Hashed at rest, 10-minute expiry, max 5 verification attempts.';
