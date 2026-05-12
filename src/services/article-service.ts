/**
 * Article Service — Quản lý dữ liệu bài viết (Insights & Guides)
 */

import { createServerAnonClient } from './supabase-server';
import type { Article, PaginatedResponse } from '@/types/database';

const DEFAULT_PAGE_SIZE = 12;

/**
 * Lấy danh sách bài viết đã được publish.
 */
export async function getPublishedArticles(
  category?: string,
  page = 1,
  limit = DEFAULT_PAGE_SIZE
): Promise<PaginatedResponse<Article>> {
  const supabase = createServerAnonClient();
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('articles')
      .select('*', { count: 'exact' })
      .eq('status', 'published');

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error, count } = await query
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      data: (data as Article[]) || [],
      total: count || 0,
      page,
      limit,
      hasMore: (offset + limit) < (count || 0),
    };
  } catch (err) {
    console.error('[article-service] getPublishedArticles error:', err);
    return { data: [], total: 0, page, limit, hasMore: false };
  }
}

/**
 * Lấy chi tiết bài viết theo Slug.
 */
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const supabase = createServerAnonClient();
  const decodedSlug = decodeURIComponent(slug);

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('slug', decodedSlug)
      .eq('status', 'published')
      .maybeSingle();

    if (error) {
      console.error('[article-service] Supabase error:', error);
      throw error;
    }

    if (data) {
      return data as Article;
    }

    const { data: legacyData, error: legacyError } = await supabase
      .from('articles')
      .select('*')
      .eq('status', 'published')
      .contains('seo_meta', { legacy_slugs: [decodedSlug] })
      .maybeSingle();

    if (legacyError) {
      console.error('[article-service] legacy slug Supabase error:', legacyError);
      throw legacyError;
    }

    return legacyData as Article;
  } catch (err) {
    console.error('[article-service] getArticleBySlug error:', err);
    return null;
  }
}

/**
 * Lấy các slug bài viết published để pre-render các trang SEO quan trọng.
 */
export async function getPublishedArticleSlugs(limit = 100): Promise<string[]> {
  const supabase = createServerAnonClient();

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('slug')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || [])
      .map((article) => article.slug)
      .filter((slug): slug is string => Boolean(slug));
  } catch (err) {
    console.error('[article-service] getPublishedArticleSlugs error:', err);
    return [];
  }
}

/**
 * Lấy bài viết liên quan dựa trên tags, fallback theo category nếu chưa có tag overlap.
 */
export async function getRelatedArticles(
  article: Article,
  limit = 3
): Promise<Article[]> {
  const supabase = createServerAnonClient();

  try {
    let query = supabase
      .from('articles')
      .select('*')
      .eq('status', 'published')
      .neq('id', article.id)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (article.tags.length > 0) {
      query = query.overlaps('tags', article.tags);
    } else if (article.category) {
      query = query.eq('category', article.category);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data as Article[]) || [];
  } catch (err) {
    console.error('[article-service] getRelatedArticles error:', err);
    return [];
  }
}

/**
 * Lấy danh sách categories hiện có.
 */
export async function getArticleCategories(): Promise<string[]> {
  const supabase = createServerAnonClient();

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('category')
      .eq('status', 'published');

    if (error) throw error;

    const categories = (data || [])
      .map((a) => a.category)
      .filter((c): c is string => !!c);
      
    return [...new Set(categories)].sort();
  } catch (err) {
    console.error('[article-service] getArticleCategories error:', err);
    return [];
  }
}
