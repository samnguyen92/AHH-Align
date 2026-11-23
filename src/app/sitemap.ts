import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getArticleSitemapEntries } from '@/services/article-service';
import {
  getClinicSitemapEntries,
  getTopCityCombos,
  getTopSpecialtyCombos,
} from '@/services/clinic-service';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [clinics, articles, cities, specialties, headersList] = await Promise.all([
    getClinicSitemapEntries(),
    getArticleSitemapEntries(),
    getTopCityCombos(200),
    getTopSpecialtyCombos(1000),
    headers(),
  ]);

  // The configured public address wins: building URLs from the request's Host header listed the address the visitor (or the
  // bot's audit, "http://web:3000") happened to use instead of the real site. The header is only a fallback.
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || 'localhost:3000';
  const proto = headersList.get('x-forwarded-proto') || 'http';
  const siteUrl = (configured || `${proto}://${host}`).replace(/\/$/, '');

  const dynamicUrl = (path = '/') => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${siteUrl}${normalizedPath}`;
  };

  return [
    {
      url: dynamicUrl('/'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: dynamicUrl('/search'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: dynamicUrl('/insights'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: dynamicUrl('/pulse'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: dynamicUrl('/about'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: dynamicUrl('/claim'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    ...clinics.map((clinic) => ({
      url: dynamicUrl(`/clinics/${clinic.slug}`),
      lastModified: new Date(clinic.created_at),
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    })),
    ...articles.map((article) => ({
      url: dynamicUrl(`/insights/${article.slug}`),
      lastModified: new Date(article.updated_at || article.published_at || now),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...cities.map((city) => ({
      url: dynamicUrl(city.path),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.65,
    })),
    ...specialties.map((combo) => ({
      url: dynamicUrl(combo.path),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
