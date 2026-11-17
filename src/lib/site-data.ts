// Server-side loaders for the home, directory (/search) and clinic pages.
// Client-safe shapes live in src/components/site/types so the client components never import the services.
import { getPublishedArticles } from '@/services/article-service';
import { getSearchFilterOptions, searchClinics } from '@/services/clinic-service';
import { getClinicFallbackImage, getSafeClinicImageSrc } from '@/lib/clinic-image';
import { getSafeArticleImageSrc } from '@/lib/article-image';
import type { Clinic } from '@/types/database';
import type { ClinicPageData, DirClinic, DirectoryData, DirectoryParams, HomeData } from '@/components/site/types';

/** The stored clinic photos are watermarked stock, so clinics show one of the site's own photos for now. */
export const CLINIC_PHOTOS = [1, 2, 3, 4].map((n) => `/brand/photos/clinic-${n}.webp`);
const GUIDE_PHOTOS = ['a3-guide-left', 'a4-guide-right', 'b3-steps'].map((n) => `/brand/photos/${n}.webp`);

const SPECIALTIES = [
  'Primary Care',
  'Dental',
  'Mental Health',
  'OB/GYN',
  'Pediatrics',
  'Cardiology',
  'Ophthalmology',
  'Dermatology',
  'Orthopedics',
];

const PAGE_SIZE = 12; // fills a 2- or 3-column grid evenly

/** The three directory languages a clinic supports, from its free-text language list. */
export function directoryLanguages(c: Clinic): string[] {
  const out = new Set<string>();
  for (const raw of c.languages ?? []) {
    const l = (raw || '').toLowerCase();
    if (l.includes('vietnam') || l.includes('tiếng việt')) out.add('Vietnamese');
    else if (l.includes('korean') || l.includes('한국')) out.add('Korean');
    else if (/chinese|mandarin|cantonese|toisan|taishan|fuzhou|hokkien|taiwanese|中文/.test(l)) out.add('Chinese');
  }
  return ['Vietnamese', 'Korean', 'Chinese'].filter((n) => out.has(n));
}

/** ALL-CAPS listing names read as shouting; title-case them. */
export function displayName(name: string) {
  return name === name.toUpperCase() ? name.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : name;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** one of the site photos, stable per clinic */
export const photoFor = (slug: string) => CLINIC_PHOTOS[hash(slug) % CLINIC_PHOTOS.length];

const rating = (c: Clinic) => (typeof c.metadata?.rating === 'number' ? c.metadata.rating.toFixed(1) : null);
const fallbackFor = (c: Clinic, i: number) =>
  getSafeClinicImageSrc(c.metadata?.images?.[0]) || getClinicFallbackImage(c.specialty, c.slug || i);

function toDirClinic(c: Clinic, i: number): DirClinic {
  return {
    id: c.id,
    slug: c.slug,
    name: displayName(c.name),
    specialty: c.specialty || 'Clinic',
    place: [c.city, c.state].filter(Boolean).join(', '),
    rating: rating(c),
    reviews: c.metadata?.rating_count ?? 0,
    langs: directoryLanguages(c),
    telehealth: !!c.is_telehealth_available,
    accepting: c.metadata?.accepting_new_patients ?? null,
    // neighbours on a page never share a photo; the clinic page itself uses photoFor(slug)
    image: CLINIC_PHOTOS[i % CLINIC_PHOTOS.length],
    fallback: fallbackFor(c, i),
  };
}

function inCore(c: Clinic) {
  const s = (c.specialty || '').toLowerCase();
  return !!s && SPECIALTIES.some((n) => s.includes(n.toLowerCase()) || n.toLowerCase().includes(s));
}

export async function getHomeData(): Promise<HomeData> {
  const [filters, clinicResult, articles] = await Promise.all([
    getSearchFilterOptions(),
    searchClinics({ limit: 80, sort: 'reviews' }),
    getPublishedArticles(undefined, 1, 3, 'pulse'),
  ]);

  const lang = (name: string) => filters.languages.find((l) => l.value === name)?.count ?? 0;
  const spec = (name: string) => filters.specialties.find((s) => s.value.toLowerCase() === name.toLowerCase())?.count ?? 0;

  // four well-reviewed clinics in different core specialties, each with a directory language
  const seen = new Set<string>();
  const clinics = clinicResult.data
    .filter((c) => typeof c.metadata?.rating === 'number' && (c.metadata?.rating_count ?? 0) >= 20 && directoryLanguages(c).length && inCore(c))
    .filter((c) => {
      const k = (c.specialty || '').toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 4)
    .map((c, i) => ({
      id: c.id,
      name: displayName(c.name),
      slug: c.slug,
      specialty: c.specialty || 'Clinic',
      place: `${c.city}, ${c.state}`,
      rating: rating(c),
      reviews: c.metadata?.rating_count ?? 0,
      langs: directoryLanguages(c),
      telehealth: !!c.is_telehealth_available,
      image: CLINIC_PHOTOS[i % CLINIC_PHOTOS.length],
      fallback: fallbackFor(c, i),
    }));

  return {
    counts: { total: clinicResult.total, vi: lang('Vietnamese'), ko: lang('Korean'), zh: lang('Chinese') },
    specialties: SPECIALTIES.map((name) => ({ name, count: spec(name), href: `/search?specialty=${encodeURIComponent(name)}` })),
    clinics,
    cities: filters.cities
      .filter((c) => c.count >= 5)
      .slice(0, 12)
      .map((c) => ({ name: c.value, state: c.state, count: c.count, href: `/search?city=${encodeURIComponent(c.value)}` })),
    guides: articles.data.map((a, i) => ({
      title: a.title,
      category: a.category || 'Guide',
      slug: a.slug,
      excerpt: a.excerpt || 'Practical healthcare guidance for Asian American families.',
      // a different photo per guide when the article has no usable image
      image: getSafeArticleImageSrc(a.seo_meta.og_image || a.seo_meta.images?.[0] || null) || GUIDE_PHOTOS[i % GUIDE_PHOTOS.length],
      fallback: GUIDE_PHOTOS[i % GUIDE_PHOTOS.length],
    })),
  };
}

export async function getDirectoryData(params: DirectoryParams): Promise<DirectoryData> {
  const page = Math.max(1, Number(params.page) || 1);
  const minRating = params.minRating ? Number(params.minRating) : undefined;
  const [result, filters] = await Promise.all([
    searchClinics({
      query: params.query,
      language: params.language,
      specialty: params.specialty,
      city: params.city,
      state: params.state,
      insurance: params.insurance,
      telehealth: params.telehealth === 'true',
      acceptingNew: params.acceptingNew === 'true',
      openWeekend: params.openWeekend === 'true',
      priceTier: params.priceTier,
      minRating: minRating && !Number.isNaN(minRating) ? minRating : undefined,
      sort: params.sort ?? 'rating',
      page,
      limit: PAGE_SIZE,
    }),
    getSearchFilterOptions(),
  ]);
  const lang = (name: string) => filters.languages.find((l) => l.value === name)?.count ?? 0;
  return {
    params,
    page,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE)),
    pageSize: PAGE_SIZE,
    clinics: result.data.map(toDirClinic),
    languages: [
      { value: 'Vietnamese', native: 'Tiếng Việt', lang: 'vi', count: lang('Vietnamese') },
      { value: 'Korean', native: '한국어', lang: 'ko', count: lang('Korean') },
      { value: 'Chinese', native: '中文', lang: 'zh', count: lang('Chinese') },
    ],
    specialties: filters.specialties.filter((s) => s.count > 0).slice(0, 14),
    cities: filters.cities.filter((c) => c.count >= 5).slice(0, 12),
  };
}

export async function getClinicPageData(clinic: Clinic): Promise<ClinicPageData> {
  const similar = await searchClinics({ specialty: clinic.specialty || undefined, sort: 'reviews', limit: 8 });
  return {
    clinic: { ...clinic, name: displayName(clinic.name) },
    photo: photoFor(clinic.slug),
    langs: directoryLanguages(clinic),
    similar: similar.data.filter((c) => c.slug !== clinic.slug).slice(0, 4).map(toDirClinic),
  };
}
