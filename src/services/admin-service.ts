import { createServerSupabaseClient } from '@/services/supabase-server';
import type { Article, Clinic } from '@/types/database';

export interface AdminClinicRow {
  id: string;
  npi: string;
  name: string;
  specialty: string;
  status: string;
}

export interface AdminArticleRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  status: Article['status'];
  tags: string[];
  seoDescription: string;
  seoImage: string | null;
  updatedAt: string;
  publishedAt: string | null;
  wordCount: number;
  readingMinutes: number;
}

export interface AdminClaimRow {
  id: string;
  doctorName: string;
  clinicId: string;
  clinicName: string;
  npi: string;
  status: 'pending' | 'approved' | 'rejected';
  proofType: string;
  proofs: Array<{ type: string; label: string; verified: boolean }>;
  notes: string;
  submittedAt: string;
}

export interface AdminOverviewData {
  totalClinics: number;
  pendingClaims: number;
  draftArticles: number;
  latestClinics: AdminClinicRow[];
}

export interface AdminArticlesData {
  articles: AdminArticleRow[];
  counts: Record<Article['status'], number>;
}

export type AdminUserRole = 'user' | 'provider' | 'admin' | 'superadmin';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: AdminUserRole;
  createdAt: string;
  lastSignInAt: string | null;
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return 'Recently';

  const timestamp = new Date(value).getTime();
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function countWords(content: string | null | undefined) {
  const text = (content ?? '').replace(/[#>*_`|~-]/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').length : 0;
}

function clinicStatus(clinic: Pick<Clinic, 'is_claimed' | 'claimed_by'>) {
  if (clinic.is_claimed || clinic.claimed_by) return 'Verified';
  return 'Active';
}

function mapClinic(clinic: Clinic): AdminClinicRow {
  return {
    id: clinic.id,
    npi: clinic.metadata?.npi_number ?? clinic.id.slice(0, 8),
    name: clinic.name,
    specialty: clinic.specialty ?? 'Primary Care',
    status: clinicStatus(clinic),
  };
}

function mapArticle(article: Article): AdminArticleRow {
  const words = countWords(article.content);
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt ?? article.seo_meta.description ?? 'No excerpt available.',
    content: article.content,
    category: article.category ?? 'General Health',
    status: article.status,
    tags: article.tags ?? [],
    seoDescription: article.seo_meta.description ?? article.excerpt ?? '',
    seoImage: article.seo_meta.og_image ?? article.seo_meta.images?.[0] ?? null,
    updatedAt: article.updated_at,
    publishedAt: article.published_at,
    wordCount: words,
    readingMinutes: Math.max(1, Math.ceil(words / 220)),
  };
}

function proofLabel(type: string) {
  if (type === 'npi_verification') return 'NPI Verification';
  if (type === 'phone_verification') return 'Phone Verification';
  if (type === 'document') return 'Document Upload';
  return type.replaceAll('_', ' ');
}

function mapClaim(row: {
  id: string;
  clinic_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  proof_type: string | null;
  proof_data: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  clinics: Clinic | Clinic[] | null;
}): AdminClaimRow {
  const clinic = Array.isArray(row.clinics) ? row.clinics[0] : row.clinics;
  const proofType = row.proof_type ?? 'document';
  const proofValue =
    typeof row.proof_data?.value === 'string' ? row.proof_data.value : null;

  return {
    id: row.id,
    doctorName:
      typeof row.proof_data?.contact_name === 'string'
        ? row.proof_data.contact_name
        : `User ${row.user_id.slice(0, 8)}`,
    clinicId: row.clinic_id,
    clinicName:
      clinic?.name ??
      (typeof row.proof_data?.clinic_name === 'string'
        ? row.proof_data.clinic_name
        : 'Clinic profile'),
    npi: clinic?.metadata?.npi_number ?? proofValue ?? 'N/A',
    status: row.status,
    proofType,
    proofs: [
      {
        type:
          proofType === 'npi_verification'
            ? 'domain'
            : proofType === 'document'
              ? 'document'
              : 'photo',
        label: proofLabel(proofType),
        verified: row.status !== 'rejected',
      },
    ],
    notes: row.notes ?? '',
    submittedAt: formatRelativeTime(row.created_at),
  };
}

async function countRows(
  table: 'clinics' | 'claim_requests' | 'articles',
  status?: string
) {
  const supabase = createServerSupabaseClient();
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (status) {
    query = query.eq('status', status);
  }
  const { count, error } = await query;
  if (error) {
    console.error(`[admin-service] count ${table} error:`, error);
    return 0;
  }
  return count ?? 0;
}

export async function getAdminOverviewData(): Promise<AdminOverviewData> {
  const supabase = createServerSupabaseClient();
  const [totalClinics, pendingClaims, draftArticles, latestClinicsResult] =
    await Promise.all([
      countRows('clinics'),
      countRows('claim_requests', 'pending'),
      countRows('articles', 'draft'),
      supabase
        .from('clinics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

  if (latestClinicsResult.error) {
    console.error('[admin-service] latest clinics error:', latestClinicsResult.error);
  }

  return {
    totalClinics,
    pendingClaims,
    draftArticles,
    latestClinics: ((latestClinicsResult.data ?? []) as Clinic[]).map(mapClinic),
  };
}

export async function getAdminClinics(limit = 20) {
  const supabase = createServerSupabaseClient();
  const { data, error, count } = await supabase
    .from('clinics')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[admin-service] getAdminClinics error:', error);
    return { clinics: [], total: 0 };
  }

  return {
    clinics: ((data ?? []) as Clinic[]).map(mapClinic),
    total: count ?? 0,
  };
}

export async function getAdminArticles(limit = 20): Promise<AdminArticlesData> {
  const supabase = createServerSupabaseClient();
  const [articlesResult, draftCount, publishedCount, archivedCount] =
    await Promise.all([
      supabase
        .from('articles')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit),
      countRows('articles', 'draft'),
      countRows('articles', 'published'),
      countRows('articles', 'archived'),
    ]);

  if (articlesResult.error) {
    console.error('[admin-service] getAdminArticles error:', articlesResult.error);
  }

  return {
    articles: ((articlesResult.data ?? []) as Article[]).map(mapArticle),
    counts: {
      draft: draftCount,
      published: publishedCount,
      archived: archivedCount,
    },
  };
}

export async function getAdminArticleById(id: string): Promise<Article | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[admin-service] getAdminArticleById error:', error);
    return null;
  }

  return data as Article | null;
}

export async function getAdminClaims(limit = 50): Promise<AdminClaimRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('claim_requests')
    .select('id,clinic_id,user_id,status,proof_type,proof_data,notes,created_at,clinics(*)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[admin-service] getAdminClaims error:', error);
    return [];
  }

  return ((data ?? []) as unknown as Parameters<typeof mapClaim>[0][]).map(mapClaim);
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = createServerSupabaseClient();
  const [usersResult, rolesResult] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 100 }),
    supabase.from('user_roles').select('user_id,role'),
  ]);

  if (usersResult.error) {
    console.error('[admin-service] getAdminUsers auth error:', usersResult.error);
    return [];
  }

  if (rolesResult.error) {
    console.error('[admin-service] getAdminUsers role error:', rolesResult.error);
  }

  const roleByUserId = new Map<string, AdminUserRole>();
  ((rolesResult.data ?? []) as Array<{ user_id: string; role: AdminUserRole }>).forEach((row) => {
    roleByUserId.set(row.user_id, row.role);
  });

  return usersResult.data.users.map((user) => {
    const metadata = user.user_metadata ?? {};
    const name =
      typeof metadata.name === 'string'
        ? metadata.name
        : typeof metadata.full_name === 'string'
          ? metadata.full_name
          : '';

    return {
      id: user.id,
      email: user.email ?? 'No email',
      name,
      role: roleByUserId.get(user.id) ?? 'provider',
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    };
  });
}
