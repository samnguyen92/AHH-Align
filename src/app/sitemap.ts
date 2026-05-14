import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';
import { getArticleSitemapEntries } from '@/services/article-service';
import {
  getClinicSitemapEntries,
  getTopCityCombos,
  getTopSpecialtyCombos,
} from '@/services/clinic-service';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [clinics, articles, cities, specialties] = await Promise.all([
    getClinicSitemapEntries(),
    getArticleSitemapEntries(),
    getTopCityCombos(200),
    getTopSpecialtyCombos(1000),
  ]);

  return [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/search'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/insights'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/claim'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    ...clinics.map((clinic) => ({
      url: absoluteUrl(`/clinics/${clinic.slug}`),
      lastModified: new Date(clinic.created_at),
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    })),
    ...articles.map((article) => ({
      url: absoluteUrl(`/insights/${article.slug}`),
      lastModified: new Date(article.updated_at || article.published_at || now),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...cities.map((city) => ({
      url: absoluteUrl(city.path),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.65,
    })),
    ...specialties.map((combo) => ({
      url: absoluteUrl(combo.path),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
