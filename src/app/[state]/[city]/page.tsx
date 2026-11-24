import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DirectoryPage } from '@/components/site/directory';
import { getDirectoryData } from '@/lib/site-data';
import { JsonLd } from '@/lib/json-ld';
import { absoluteUrl, SITE_NAME } from '@/lib/site';
import { cityRoute, stateSlugToCode, unslugifySegment } from '@/lib/local-seo';
import { getTopSpecialtyCombos, resolveCityCombo } from '@/services/clinic-service';

export const dynamic = 'force-dynamic';

interface CityPageProps {
  params: Promise<{ state: string; city: string }>;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { state, city } = await params;
  const known = await resolveCityCombo(state, city);
  const cityName = known?.city ?? unslugifySegment(city);
  const stateCode = known?.state ?? stateSlugToCode(state);
  const path = cityRoute(stateCode, cityName);

  return {
    title: `Vietnamese and Asian Doctors in ${cityName}, ${stateCode}`,
    description: `Find Vietnamese, Korean, Chinese, and Asian-language clinics in ${cityName}, ${stateCode}. Compare specialties, languages, reviews, and contact details.`,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: `Asian-language clinics in ${cityName}, ${stateCode}`,
      description: `Search culturally aware clinics and healthcare providers in ${cityName}.`,
      url: absoluteUrl(path),
    },
  };
}

export default async function CityLandingPage({ params }: CityPageProps) {
  const { state, city } = await params;
  const known = await resolveCityCombo(state, city);
  const cityName = known?.city ?? unslugifySegment(city);
  const stateCode = known?.state ?? stateSlugToCode(state);
  const data = await getDirectoryData({ city: cityName, state: stateCode });

  if (data.total === 0) {
    notFound();
  }

  const specialties = (await getTopSpecialtyCombos(500))
    .filter((combo) => combo.stateSlug === state && combo.citySlug === city)
    .slice(0, 8);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Asian-language clinics in ${cityName}, ${stateCode}`,
    url: absoluteUrl(cityRoute(stateCode, cityName)),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: absoluteUrl('/'),
    },
    about: `Clinics and healthcare providers serving Asian American patients in ${cityName}, ${stateCode}`,
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <DirectoryPage
        data={data}
        intro={{
          eyebrow: 'Local healthcare directory',
          title: `Vietnamese and Asian Doctors in ${cityName}, ${stateCode}`,
          lede: 'Compare clinics that support Asian American patients with language access, culturally aware care, and local contact information.',
          related: specialties.map((combo) => ({ href: combo.path, label: `${combo.specialty} in ${cityName}` })),
        }}
      />
    </>
  );
}
