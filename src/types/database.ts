/**
 * Core database types for Asian Health Hub
 * Mirrors the PostgreSQL schema in supabase/schema.sql
 */

// ---- Organizations ----

export interface Organization {
  id: string;
  name: string;
  website: string | null;
  created_at: string;
}

export type OrganizationInsert = Omit<Organization, 'id' | 'created_at'>;
export type OrganizationUpdate = Partial<OrganizationInsert>;

// ---- Clinics ----

/** Cấu trúc metadata JSONB lưu trong bảng clinics */
export interface ClinicMetadata {
  reviews?: Review[];
  working_hours?: WorkingHours;
  services?: string[];
  rating?: number;
  rating_count?: number;
  images?: string[];
  insurance_accepted?: string[];
  npi_number?: string;
  google_place_id?: string;
  google_maps_url?: string;
  google_website_url?: string;
  google_formatted_address?: string;
  google_business_status?: string;
  google_photo_attributions?: unknown[];
  location?: {
    latitude?: number;
    longitude?: number;
  };
}

export interface Review {
  source: 'google' | 'yelp' | 'internal';
  author: string;
  author_url?: string;
  rating: number;
  text: string;
  date: string;
}

export interface WorkingHours {
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}

export interface Clinic {
  id: string;
  org_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  languages: string[];
  specialty: string | null;
  is_telehealth_available: boolean;
  claimed_by: string | null;
  is_claimed: boolean;
  metadata: ClinicMetadata;
  created_at: string;
}

export type ClinicInsert = Omit<Clinic, 'id' | 'created_at'>;
export type ClinicUpdate = Partial<ClinicInsert>;

// ---- Search / Filter ----

export interface ClinicSearchParams {
  city?: string;
  state?: string;
  specialty?: string;
  language?: string;
  query?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ---- Insights / Articles (Phase 5) ----

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  seo_meta: {
    description?: string;
    keywords?: string[];
    og_image?: string;
    images?: string[];
    primary_keyword?: string;
    secondary_keywords?: string[];
    content_mode?: 'insight' | 'guide' | string;
    legacy_slugs?: string[];
    last_rewrite_instruction?: string;
    last_rewritten_at?: string;
    current_version?: number;
    version_label?: string;
    versions?: Array<{
      version: number;
      label: string;
      saved_at: string;
      title?: string | null;
      slug?: string | null;
      excerpt?: string | null;
      content?: string | null;
      category?: string | null;
      tags?: string[];
      status?: 'draft' | 'published' | 'archived';
      author?: string | null;
      published_at?: string | null;
      updated_at?: string | null;
      word_count?: number;
      rewrite_instruction?: string | null;
      rewritten_at?: string | null;
      seo_meta?: Record<string, unknown>;
    }>;
  };
  author: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleFact {
  id: string;
  article_id: string;
  fact_text: string;
  source_url: string | null;
  source_name: string | null;
  verified: boolean;
  created_at: string;
}

// ---- Claim Requests (Phase 6) ----

export type ClaimRequestStatus = 'pending' | 'approved' | 'rejected';
export type ClaimProofType = 'npi_verification' | 'phone_verification' | 'document';

export interface ClaimRequest {
  id: string;
  clinic_id: string;
  user_id: string;
  status: ClaimRequestStatus;
  proof_type: ClaimProofType | null;
  proof_data: Record<string, unknown>;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}
