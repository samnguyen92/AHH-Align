-- ============================================
-- Asian Health Hub — Database Schema
-- Current app state: Phase 5 (Insights & Guides)
-- Run this in Supabase SQL Editor.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
-- 4. Row Level Security
-- ============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_facts ENABLE ROW LEVEL SECURITY;

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
  USING (true)
  WITH CHECK (true);

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
  USING (true)
  WITH CHECK (true);

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

-- ============================================
-- DONE — Schema synced through Phase 5
-- ============================================
