-- ============================================
-- Asian Health Hub — PostgreSQL 16 Schema
-- Self-hosted with pgvector
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Auth schema for compatibility with existing foreign keys
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email               TEXT UNIQUE,
  encrypted_password  TEXT,
  raw_user_meta_data  JSONB DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Helpers
-- ============================================

CREATE OR REPLACE FUNCTION public.slugify(input_text TEXT)
RETURNS TEXT AS $$
  SELECT trim(both '-' from regexp_replace(
    regexp_replace(lower(coalesce(input_text, '')), '[^a-z0-9\s-]', '', 'g'),
    '[\s_-]+',
    '-',
    'g'
  ));
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_clinic_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug = public.slugify(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 1. Organizations
-- ============================================

CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  website    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_name
  ON organizations USING GIN (to_tsvector('english', name));

-- ============================================
-- 2. Clinics
-- ============================================

CREATE TABLE IF NOT EXISTS clinics (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                  UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name                    TEXT NOT NULL,
  slug                    TEXT UNIQUE,
  description             TEXT,
  address                 TEXT,
  city                    TEXT,
  state                   TEXT,
  zip_code                TEXT,
  phone                   TEXT,
  languages               TEXT[] DEFAULT '{}',
  specialty               TEXT,
  is_telehealth_available BOOLEAN NOT NULL DEFAULT false,
  claimed_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_claimed              BOOLEAN NOT NULL DEFAULT false,
  metadata                JSONB DEFAULT '{}'::JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_clinics_set_slug ON clinics;
CREATE TRIGGER trg_clinics_set_slug
  BEFORE INSERT OR UPDATE OF name, slug ON clinics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_clinic_slug();

CREATE INDEX IF NOT EXISTS idx_clinics_city_state ON clinics (city, state);
CREATE INDEX IF NOT EXISTS idx_clinics_specialty ON clinics (specialty);
CREATE INDEX IF NOT EXISTS idx_clinics_languages ON clinics USING GIN (languages);
CREATE INDEX IF NOT EXISTS idx_clinics_metadata ON clinics USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_clinics_name_fts ON clinics USING GIN (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_clinics_slug ON clinics (slug);

-- ============================================
-- 3. Articles / Insights
-- ============================================

CREATE TABLE IF NOT EXISTS articles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         TEXT UNIQUE NOT NULL,
  title        TEXT NOT NULL,
  excerpt      TEXT,
  content      TEXT NOT NULL,
  category     TEXT,
  tags         TEXT[] DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  seo_meta     JSONB DEFAULT '{}'::JSONB,
  author       TEXT NOT NULL DEFAULT 'Asian Health Hub',
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_facts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id  UUID REFERENCES articles(id) ON DELETE CASCADE,
  fact_text   TEXT NOT NULL,
  source_url  TEXT,
  source_name TEXT,
  verified    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_articles_updated_at ON articles;
CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_articles_status_published_at ON articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);
CREATE INDEX IF NOT EXISTS idx_articles_tags ON articles USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles (slug);
CREATE INDEX IF NOT EXISTS idx_article_facts_article_id ON article_facts (article_id);

-- ============================================
-- 4. Claim Requests & Submissions
-- ============================================

CREATE TABLE IF NOT EXISTS claim_requests (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID REFERENCES clinics(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  proof_type  TEXT CHECK (proof_type IN ('npi_verification', 'phone_verification', 'document')),
  proof_data  JSONB DEFAULT '{}'::JSONB,
  notes       TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_requests_clinic_id ON claim_requests (clinic_id);
CREATE INDEX IF NOT EXISTS idx_claim_requests_user_id ON claim_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_claim_requests_status_created_at ON claim_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS clinic_submissions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_name  TEXT NOT NULL,
  full_name    TEXT NOT NULL,
  role         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT NOT NULL,
  website      TEXT,
  updates      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_submissions_status_created_at ON clinic_submissions (status, created_at DESC);

-- ============================================
-- 5. User Roles
-- ============================================

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'provider' CHECK (role IN ('user', 'provider', 'admin', 'superadmin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (role);

CREATE OR REPLACE FUNCTION public.is_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = user_uuid
      AND role IN ('admin', 'superadmin')
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_superadmin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = user_uuid
      AND role = 'superadmin'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================
-- 6. Clinic Embeddings (pgvector)
-- ============================================

CREATE TABLE IF NOT EXISTS clinic_embeddings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID REFERENCES clinics(id) ON DELETE CASCADE,
  embedding   vector(1536),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_embeddings_clinic_id
  ON clinic_embeddings (clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_embeddings_vector
  ON clinic_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.match_clinic_embeddings(
  query_embedding vector(1536),
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  clinic_id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    clinic_embeddings.clinic_id,
    clinic_embeddings.content,
    1 - (clinic_embeddings.embedding <=> query_embedding) AS similarity
  FROM clinic_embeddings
  ORDER BY clinic_embeddings.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================
-- 7. Analytics & Newsletter
-- ============================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name  TEXT NOT NULL,
  path        TEXT,
  metadata    JSONB DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created_at
  ON analytics_events (event_name, created_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_email
  ON newsletter_subscriptions (email);

