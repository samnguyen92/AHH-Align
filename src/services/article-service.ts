/**
 * Article Service — Quản lý dữ liệu bài viết (Insights & Guides)
 */

import { createServerAnonClient } from './supabase-server';
import type { Article, PaginatedResponse } from '@/types/database';

const DEFAULT_PAGE_SIZE = 12;
const MODE_CATEGORY_SLUGS = {
  insight: new Set(['insight', 'insights']),
  guide: new Set(['guide', 'guides', 'in-depth-guides', 'in-depth-guide']),
  pulse: new Set(['pulse', 'pulses', 'newsletter', 'newsletters']),
};

export type ArticleContentMode = 'insight' | 'guide' | 'pulse';

export function slugifyArticleCategory(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getArticleContentMode(article: Article): ArticleContentMode {
  const seoMode = article.seo_meta.content_mode?.toLowerCase();
  if (seoMode === 'guide') return 'guide';
  if (seoMode === 'insight') return 'insight';
  if (seoMode === 'pulse') return 'pulse';

  const categorySlug = slugifyArticleCategory(article.category ?? '');
  if (MODE_CATEGORY_SLUGS.guide.has(categorySlug)) return 'guide';
  if (MODE_CATEGORY_SLUGS.pulse.has(categorySlug)) return 'pulse';

  const text = `${article.title} ${article.category ?? ''} ${article.tags.join(' ')}`.toLowerCase();
  if (
    text.includes('guide') ||
    text.includes('uscis') ||
    text.includes('i-693') ||
    text.includes('insurance')
  ) {
    return 'guide';
  }
  if (text.includes('pulse') || text.includes('newsletter')) {
    return 'pulse';
  }

  return 'insight';
}

function matchesCategorySlug(article: Article, categorySlug?: string) {
  if (!categorySlug) return true;

  if (MODE_CATEGORY_SLUGS.insight.has(categorySlug)) {
    return getArticleContentMode(article) === 'insight';
  }

  if (MODE_CATEGORY_SLUGS.guide.has(categorySlug)) {
    return getArticleContentMode(article) === 'guide';
  }

  const articleCategorySlug = slugifyArticleCategory(article.category ?? '');

  return articleCategorySlug === categorySlug;
}

function matchesTagSlug(article: Article, tagSlug?: string) {
  if (!tagSlug) return true;

  return article.tags.map(slugifyArticleCategory).includes(tagSlug);
}

/**
 * Lấy danh sách bài viết đã được publish.
 */
export async function getPublishedArticles(
  category?: string,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
  excludeCategory?: string
): Promise<PaginatedResponse<Article>> {
  const supabase = createServerAnonClient();
  const offset = (page - 1) * limit;

  if (!supabase) {
    return { data: [], total: 0, page, limit, hasMore: false };
  }

  try {
    let query = supabase
      .from('articles')
      .select('*', { count: 'exact' })
      .eq('status', 'published');

    if (category) {
      query = query.eq('category', category);
    } else if (excludeCategory) {
      query = query.neq('category', excludeCategory);
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
 * Lấy bài published theo mode riêng để Insights và Guides không bị trùng list.
 */
export async function getPublishedArticlesByMode(
  mode: ArticleContentMode,
  filters?: { categorySlug?: string; tagSlug?: string },
  limit = 5
): Promise<Article[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(120);

    if (error) throw error;

    return ((data as Article[]) || [])
      .filter((article) => getArticleContentMode(article) === mode)
      .filter((article) => matchesCategorySlug(article, filters?.categorySlug))
      .filter((article) => matchesTagSlug(article, filters?.tagSlug))
      .slice(0, limit);
  } catch (err) {
    console.error('[article-service] getPublishedArticlesByMode error:', err);
    return [];
  }
}

/**
 * Lấy chi tiết bài viết theo Slug.
 */
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const supabase = createServerAnonClient();
  const decodedSlug = decodeURIComponent(slug);

  if (!supabase) {
    return null;
  }

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

  if (!supabase) {
    return [];
  }

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

export interface ArticleSitemapEntry {
  slug: string;
  updated_at: string;
  published_at: string | null;
}

export async function getArticleSitemapEntries(limit = 50000): Promise<ArticleSitemapEntry[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('slug,updated_at,published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return ((data ?? []) as ArticleSitemapEntry[]).filter((article) => article.slug);
  } catch (err) {
    console.error('[article-service] getArticleSitemapEntries error:', err);
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

  if (!supabase) {
    return [];
  }

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

  if (!supabase) {
    return [];
  }

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

/**
 * Lấy danh sách tags hiện có để dùng cho hot topics.
 */
export async function getArticleTags(): Promise<string[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('tags')
      .eq('status', 'published');

    if (error) throw error;

    const tags = (data || [])
      .flatMap((article) => article.tags ?? [])
      .filter((tag): tag is string => Boolean(tag));

    return [...new Set(tags)].sort();
  } catch (err) {
    console.error('[article-service] getArticleTags error:', err);
    return [];
  }
}
