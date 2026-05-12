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

    // Pagination + Sắp xếp
    const { data, error, count } = await query
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
