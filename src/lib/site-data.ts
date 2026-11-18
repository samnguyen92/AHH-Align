// Server-side loaders for the home, directory (/search) and clinic pages.
// Client-safe shapes live in src/components/site/types so the client components never import the services.
import { getPublishedArticles } from '@/services/article-service';
import { getSearchFilterOptions, searchClinics } from '@/services/clinic-service';
import { getClinicFallbackImage, getSafeClinicImageSrc } from '@/lib/clinic-image';
import { getSafeArticleImageSrc } from '@/lib/article-image';
import { clinicFamilies } from '@/lib/languages';
import type { Clinic } from '@/types/database';
import type { ClinicPageData, DirClinic, DirectoryData, DirectoryParams, HomeData } from '@/components/site/types';

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

/** Order of the language chips; other families still count but are not chips yet. */
const DIRECTORY_ORDER = ['Vietnamese', 'Korean', 'Chinese'];

const PAGE_SIZE = 12; // fills a 2- or 3-column grid evenly

/** The directory languages a clinic supports (families, e.g. Mandarin/Cantonese -> Chinese), from its free-text list. */
export function directoryLanguages(c: Clinic): string[] {
  const families = new Set(clinicFamilies(c.languages));
  return DIRECTORY_ORDER.filter((n) => families.has(n));
}

/** ALL-CAPS listing names read as shouting; title-case them. */
export function displayName(name: string) {
  return name === name.toUpperCase() ? name.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : name;
}

/** The clinic's own photo (official website first, then Google - see openclaw/clinic_photos.py), or null. */
export const realPhoto = (c: Clinic): string | null => getSafeClinicImageSrc(c.metadata?.images?.[0]);

/** Deduplicated list of all valid real photos for a clinic (website photos first, then Google Places). */
export function realPhotos(c: Clinic): string[] {
  const candidates = [
    ...(Array.isArray(c.metadata?.images) ? c.metadata.images : []),
    ...(Array.isArray(c.metadata?.gallery_images) ? c.metadata.gallery_images : []),
  ];
  const out: string[] = [];
  for (const raw of candidates) {
    const safe = getSafeClinicImageSrc(raw);
    if (safe && !out.includes(safe)) {
      out.push(safe);
    }
  }
  return out;
}

const rating = (c: Clinic) => (typeof c.metadata?.rating === 'number' ? c.metadata.rating.toFixed(1) : null);
const fallbackFor = (c: Clinic) => getClinicFallbackImage(c.specialty, c.slug);

function toDirClinic(c: Clinic): DirClinic {
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
    image: realPhoto(c),
    fallback: fallbackFor(c),
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
    .map((c) => ({
      id: c.id,
      name: displayName(c.name),
      slug: c.slug,
      specialty: c.specialty || 'Clinic',
      place: `${c.city}, ${c.state}`,
      rating: rating(c),
      reviews: c.metadata?.rating_count ?? 0,
      langs: directoryLanguages(c),
      telehealth: !!c.is_telehealth_available,
      image: realPhoto(c),
      fallback: fallbackFor(c),
    }));

  return {
    counts: { total: clinicResult.total, vi: lang('Vietnamese'), ko: lang('Korean'), zh: lang('Chinese') },
    specialties: SPECIALTIES.map((name) => ({ name, count: spec(name), href: `/search?specialty=${encodeURIComponent(name)}` })),
    clinics,
    states: filters.states
      .filter((s) => s.count >= 1)
      .slice(0, 12)
      .map((s) => ({ code: s.value, name: s.name, count: s.count, href: `/search?state=${encodeURIComponent(s.value)}` })),
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
    states: filters.states.filter((s) => s.count > 0).slice(0, 16),
    cities: filters.cities.filter((c) => c.count >= 5).slice(0, 12),
  };
}

export async function getClinicPageData(clinic: Clinic): Promise<ClinicPageData> {
  const similar = await searchClinics({ specialty: clinic.specialty || undefined, sort: 'reviews', limit: 8 });
  const photos = realPhotos(clinic);
  return {
    clinic: { ...clinic, name: displayName(clinic.name) },
    photo: photos[0] ?? null,
    photos,
    photoFallback: getClinicFallbackImage(clinic.specialty, clinic.slug),
    langs: directoryLanguages(clinic),
    similar: similar.data.filter((c) => c.slug !== clinic.slug).slice(0, 4).map(toDirClinic),
  };
}
