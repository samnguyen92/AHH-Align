/**
 * Clinic Service — Data access layer cho bảng clinics
 * Dùng cho Server Components & Route Handlers
 */

import { createServerAnonClient } from './supabase-server';
import type {
  Clinic,
  ClinicSearchParams,
  PaginatedResponse,
} from '@/types/database';
import {
  cityRoute,
  slugifySegment,
  specialtyRoute,
  stateToSlug,
} from '@/lib/local-seo';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Tìm kiếm phòng khám với bộ lọc: city, state, specialty, language.
 * Sử dụng Anon client (respects RLS — public SELECT).
 */
export async function searchClinics(
  params: ClinicSearchParams
): Promise<PaginatedResponse<Clinic>> {
  const supabase = createServerAnonClient();
  const page = params.page ?? 1;
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  if (!supabase) {
    return { data: [], total: 0, page, limit, hasMore: false };
  }

  try {
    // Xây dựng query cơ bản
    let query = supabase
      .from('clinics')
      .select('*', { count: 'exact' });

    // Áp dụng filters
    if (params.city) {
      query = query.ilike('city', `%${params.city}%`);
    }
    if (params.state) {
      query = query.eq('state', params.state.toUpperCase());
    }
    if (params.specialty) {
      query = query.ilike('specialty', `%${params.specialty}%`);
    }
    if (params.language) {
      query = query.contains('languages', [params.language]);
    }
    if (params.query) {
      query = query.or(
        `name.ilike.%${params.query}%,address.ilike.%${params.query}%`
      );
    }

    // Pagination + Sắp xếp (Ưu tiên các cơ sở có rating/ranking cao lên trước)
    const { data, error, count } = await query
      .order('metadata->rating', { ascending: false, nullsFirst: false })
      .order('metadata->rating_count', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const total = count ?? 0;

    return {
      data: (data as Clinic[]) ?? [],
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    };
  } catch (err) {
    console.error('[clinic-service] searchClinics error:', err);
    return { data: [], total: 0, page, limit, hasMore: false };
  }
}

/**
 * Lấy chi tiết một phòng khám theo ID.
 */
export async function getClinicById(id: string): Promise<Clinic | null> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return data as Clinic;
  } catch (err) {
    console.error('[clinic-service] getClinicById error:', err);
    return null;
  }
}

/**
 * Lấy chi tiết một phòng khám theo Slug.
 */
export async function getClinicBySlug(slug: string): Promise<Clinic | null> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as Clinic;
  } catch (err) {
    console.error('[clinic-service] getClinicBySlug error:', err);
    return null;
  }
}

/**
 * Lấy danh sách ngôn ngữ unique có trong hệ thống (cho filter dropdown).
 */
export async function getAvailableLanguages(): Promise<string[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('languages');

    if (error) {
      throw error;
    }

    // Flatten mảng languages từ tất cả clinics, loại bỏ trùng lặp
    const allLanguages = (data ?? []).flatMap(
      (row: { languages: string[] }) => row.languages
    );
    const uniqueLanguages = [...new Set(allLanguages)].sort();

    return uniqueLanguages;
  } catch (err) {
    console.error('[clinic-service] getAvailableLanguages error:', err);
    return [];
  }
}

export interface ClinicSitemapEntry {
  slug: string;
  created_at: string;
}

export interface CitySeoCombo {
  city: string;
  state: string;
  stateSlug: string;
  citySlug: string;
  clinicCount: number;
  path: string;
}

export interface SpecialtySeoCombo extends CitySeoCombo {
  specialty: string;
  specialtySlug: string;
}

export async function getClinicSitemapEntries(limit = 50000): Promise<ClinicSitemapEntry[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('slug,created_at')
      .not('slug', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return ((data ?? []) as ClinicSitemapEntry[]).filter((clinic) => clinic.slug);
  } catch (err) {
    console.error('[clinic-service] getClinicSitemapEntries error:', err);
    return [];
  }
}

export async function getTopCityCombos(limit = 200): Promise<CitySeoCombo[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('city,state')
      .not('city', 'is', null)
      .not('state', 'is', null)
      .limit(5000);

    if (error) throw error;

    const counts = new Map<string, CitySeoCombo>();

    for (const clinic of (data ?? []) as Pick<Clinic, 'city' | 'state'>[]) {
      if (!clinic.city || !clinic.state) continue;

      const key = `${clinic.state.toUpperCase()}|${clinic.city.toLowerCase()}`;
      const existing = counts.get(key);

      if (existing) {
        existing.clinicCount += 1;
        continue;
      }

      counts.set(key, {
        city: clinic.city,
        state: clinic.state.toUpperCase(),
        stateSlug: stateToSlug(clinic.state),
        citySlug: slugifySegment(clinic.city),
        clinicCount: 1,
        path: cityRoute(clinic.state, clinic.city),
      });
    }

    return [...counts.values()]
      .sort((a, b) => b.clinicCount - a.clinicCount)
      .slice(0, limit);
  } catch (err) {
    console.error('[clinic-service] getTopCityCombos error:', err);
    return [];
  }
}

export async function getTopSpecialtyCombos(limit = 1000): Promise<SpecialtySeoCombo[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('city,state,specialty')
      .not('city', 'is', null)
      .not('state', 'is', null)
      .not('specialty', 'is', null)
      .limit(5000);

    if (error) throw error;

    const counts = new Map<string, SpecialtySeoCombo>();

    for (const clinic of (data ?? []) as Pick<Clinic, 'city' | 'state' | 'specialty'>[]) {
      if (!clinic.city || !clinic.state || !clinic.specialty) continue;

      const key = `${clinic.state.toUpperCase()}|${clinic.city.toLowerCase()}|${clinic.specialty.toLowerCase()}`;
      const existing = counts.get(key);

      if (existing) {
        existing.clinicCount += 1;
        continue;
      }

      counts.set(key, {
        city: clinic.city,
        state: clinic.state.toUpperCase(),
        stateSlug: stateToSlug(clinic.state),
        citySlug: slugifySegment(clinic.city),
        specialty: clinic.specialty,
        specialtySlug: slugifySegment(clinic.specialty),
        clinicCount: 1,
        path: specialtyRoute(clinic.state, clinic.city, clinic.specialty),
      });
    }

    return [...counts.values()]
      .sort((a, b) => b.clinicCount - a.clinicCount)
      .slice(0, limit);
  } catch (err) {
    console.error('[clinic-service] getTopSpecialtyCombos error:', err);
    return [];
  }
}

export interface FilterOption {
  value: string;
  count: number;
}

export interface CityFilterOption extends FilterOption {
  state: string;
}

export interface SearchFilterOptions {
  specialties: FilterOption[];
  languages: FilterOption[];
  cities: CityFilterOption[];
}

const ASIAN_LANGUAGES = new Set([
  'Vietnamese',
  'Korean',
  'Chinese',
  'Japanese',
  'Tagalog',
  'Hindi',
  'Mandarin',
  'Cantonese',
  'Toisanese',
  'Thai',
  'Bengali',
  'Punjabi',
  'Urdu',
  'Tamil',
  'Telugu',
  'Gujarati'
]);

export async function getSearchFilterOptions(): Promise<SearchFilterOptions> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return { specialties: [], languages: [], cities: [] };
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('specialty, languages, city, state');

    if (error) {
      throw error;
    }

    const specialtyCounts: Record<string, number> = {};
    const languageCounts: Record<string, number> = {};
    const cityCounts: Record<string, { state: string; count: number }> = {};

    (data ?? []).forEach((clinic) => {
      // 1. Specialty
      if (clinic.specialty) {
        const spec = clinic.specialty.trim();
        specialtyCounts[spec] = (specialtyCounts[spec] || 0) + 1;
      }

      // 2. Languages
      if (clinic.languages && Array.isArray(clinic.languages)) {
        clinic.languages.forEach((lang: string) => {
          if (lang) {
            const l = lang.trim();
            // Normalize case to title case just in case
            const normalizedLang = l.charAt(0).toUpperCase() + l.slice(1).toLowerCase();
            if (ASIAN_LANGUAGES.has(normalizedLang)) {
              languageCounts[normalizedLang] = (languageCounts[normalizedLang] || 0) + 1;
            }
          }
        });
      }

      // 3. City
      if (clinic.city && clinic.state) {
        const city = clinic.city.trim();
        const state = clinic.state.trim().toUpperCase();
        const key = `${city}, ${state}`;
        if (!cityCounts[key]) {
          cityCounts[key] = { state, count: 0 };
        }
        cityCounts[key].count += 1;
      }
    });

    const specialties = Object.entries(specialtyCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    const languages = Object.entries(languageCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    const cities = Object.entries(cityCounts)
      .map(([key, item]) => {
        const city = key.substring(0, key.indexOf(','));
        return { value: city, state: item.state, count: item.count };
      })
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    return { specialties, languages, cities };
  } catch (err) {
    console.error('[clinic-service] getSearchFilterOptions error:', err);
    return { specialties: [], languages: [], cities: [] };
  }
}

