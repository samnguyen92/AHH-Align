-- User management: soft-disable (restorable for 30 days), invite links, audit log.
-- Idempotent: safe to run more than once. Applied by deploy_hostinger_vps.sh, by the bot at start-up
-- and by the web app's ensureSchema(); also included in postgres/init/01_schema.sql for fresh databases.

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS disabled_at     TIMESTAMPTZ;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

-- One-time invite links. Only a SHA-256 hash of the token is stored, so a database leak does not leak
-- usable links. The invited person sets their own password; passwords never pass through Telegram.
CREATE TABLE IF NOT EXISTS public.user_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'provider', 'admin', 'superadmin')),
  token_hash  TEXT NOT NULL UNIQUE,
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_invites_email ON public.user_invites (lower(email));

-- Who did what, and when. Never store secrets (tokens, passwords) here.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor         TEXT NOT NULL,          -- 'telegram:<id>' | 'user:<uuid>' | 'system'
  action        TEXT NOT NULL,          -- e.g. 'user.role_changed'
  target_type   TEXT,
  target_id     TEXT,
  target_label  TEXT,
  details       JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.audit_log (target_type, target_id);

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log    ENABLE ROW LEVEL SECURITY;
