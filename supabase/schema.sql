-- ============================================
-- Asian Health Hub — Database Schema
-- Current app state: Phase 8 (Admin Dashboard + RBAC)
-- Run this in Supabase SQL Editor.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

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

COMMENT ON TABLE organizations IS 'Mạng lưới/tổ chức y tế mẹ (VD: Kaiser, Sutter Health)';

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
  metadata                JSONB DEFAULT '{}'::JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_telehealth_available BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES auth.users(id);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN NOT NULL DEFAULT false;

UPDATE clinics
SET slug = public.slugify(name)
WHERE slug IS NULL OR slug = '';

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

COMMENT ON TABLE clinics IS 'Phòng khám chi tiết — đơn vị chính của Smart Directory';
COMMENT ON COLUMN clinics.languages IS 'Mảng ngôn ngữ hỗ trợ, VD: {Vietnamese, English}';
COMMENT ON COLUMN clinics.metadata IS 'JSONB chứa: reviews[], working_hours{}, rating, images[], services[], insurance_accepted[], etc.';

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

COMMENT ON TABLE articles IS 'SEO articles and healthcare guides for Insights & Guides';
COMMENT ON TABLE article_facts IS 'Source facts collected for AI-generated healthcare content';

-- ============================================
-- 4. Claim Requests
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

COMMENT ON TABLE claim_requests IS 'Provider requests to claim ownership of clinic profiles';

-- ============================================
-- 5. User Roles
-- ============================================

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'provider' CHECK (role IN ('user', 'provider', 'admin', 'superadmin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('user', 'provider', 'admin', 'superadmin'));

ALTER TABLE user_roles ALTER COLUMN role SET DEFAULT 'provider';

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (role);

COMMENT ON TABLE user_roles IS 'Application-level RBAC roles for providers and internal admins';

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

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'provider');

  IF requested_role NOT IN ('user', 'provider') THEN
    requested_role := 'provider';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, requested_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_set_role ON auth.users;
CREATE TRIGGER on_auth_user_created_set_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_role();

-- ============================================
-- 6. Clinic Embeddings
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

COMMENT ON TABLE clinic_embeddings IS 'pgvector embeddings for natural-language clinic discovery';

-- ============================================
-- 7. Analytics Events
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

COMMENT ON TABLE analytics_events IS 'Lightweight product analytics events for search, clinic clicks, and claim starts';

-- ============================================
-- 8. Row Level Security
-- ============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_public_select" ON organizations;
CREATE POLICY "organizations_public_select"
  ON organizations FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "organizations_auth_insert" ON organizations;
CREATE POLICY "organizations_auth_insert"
  ON organizations FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "organizations_auth_update" ON organizations;
CREATE POLICY "organizations_auth_update"
  ON organizations FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "clinics_public_select" ON clinics;
CREATE POLICY "clinics_public_select"
  ON clinics FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "clinics_auth_insert" ON clinics;
CREATE POLICY "clinics_auth_insert"
  ON clinics FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "clinics_auth_update" ON clinics;
CREATE POLICY "clinics_auth_update"
  ON clinics FOR UPDATE TO authenticated
  USING (claimed_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (claimed_by = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "clinics_admin_full_access" ON clinics;
CREATE POLICY "clinics_admin_full_access"
  ON clinics FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "articles_public_published_select" ON articles;
CREATE POLICY "articles_public_published_select"
  ON articles FOR SELECT TO public
  USING (status = 'published');

DROP POLICY IF EXISTS "articles_auth_insert" ON articles;
CREATE POLICY "articles_auth_insert"
  ON articles FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "articles_auth_update" ON articles;
CREATE POLICY "articles_auth_update"
  ON articles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "articles_admin_full_access" ON articles;
CREATE POLICY "articles_admin_full_access"
  ON articles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "article_facts_public_verified_select" ON article_facts;
CREATE POLICY "article_facts_public_verified_select"
  ON article_facts FOR SELECT TO public
  USING (verified = true);

DROP POLICY IF EXISTS "article_facts_auth_insert" ON article_facts;
CREATE POLICY "article_facts_auth_insert"
  ON article_facts FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "article_facts_auth_update" ON article_facts;
CREATE POLICY "article_facts_auth_update"
  ON article_facts FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "claim_requests_owner_select" ON claim_requests;
CREATE POLICY "claim_requests_owner_select"
  ON claim_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "claim_requests_owner_insert" ON claim_requests;
CREATE POLICY "claim_requests_owner_insert"
  ON claim_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "claim_requests_owner_update" ON claim_requests;
CREATE POLICY "claim_requests_owner_update"
  ON claim_requests FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() AND status = 'pending') OR public.is_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid() AND status = 'pending') OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "claim_requests_admin_full_access" ON claim_requests;
CREATE POLICY "claim_requests_admin_full_access"
  ON claim_requests FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "user_roles_self_select" ON user_roles;
CREATE POLICY "user_roles_self_select"
  ON user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "user_roles_admin_full_access" ON user_roles;
CREATE POLICY "user_roles_admin_full_access"
  ON user_roles FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "clinic_embeddings_auth_select" ON clinic_embeddings;
CREATE POLICY "clinic_embeddings_auth_select"
  ON clinic_embeddings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "clinic_embeddings_auth_insert" ON clinic_embeddings;
CREATE POLICY "clinic_embeddings_auth_insert"
  ON clinic_embeddings FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "analytics_events_no_public_select" ON analytics_events;
CREATE POLICY "analytics_events_no_public_select"
  ON analytics_events FOR SELECT TO authenticated
  USING (false);

-- ============================================
-- DONE — Schema synced through Phase 8
-- ============================================
