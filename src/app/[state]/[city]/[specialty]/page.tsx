import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DirectoryPage } from '@/components/site/directory';
import { getDirectoryData } from '@/lib/site-data';
import { JsonLd } from '@/lib/json-ld';
import { absoluteUrl, SITE_NAME } from '@/lib/site';
import {
  specialtyRoute,
  stateSlugToCode,
  unslugifySegment,
} from '@/lib/local-seo';
import { getTopSpecialtyCombos, resolveSpecialtyCombo } from '@/services/clinic-service';

export const revalidate = 86400;

interface SpecialtyPageProps {
  params: Promise<{ state: string; city: string; specialty: string }>;
}

export async function generateStaticParams() {
  const combos = await getTopSpecialtyCombos(1000);
  return combos.map((combo) => ({
    state: combo.stateSlug,
    city: combo.citySlug,
    specialty: combo.specialtySlug,
  }));
}

export async function generateMetadata({ params }: SpecialtyPageProps): Promise<Metadata> {
  const { state, city, specialty } = await params;
  const known = await resolveSpecialtyCombo(state, city, specialty);
  const cityName = known?.city ?? unslugifySegment(city);
  const specialtyName = known?.specialty ?? unslugifySegment(specialty);
  const stateCode = known?.state ?? stateSlugToCode(state);
  const path = specialtyRoute(stateCode, cityName, specialtyName);

  return {
    title: `${specialtyName} Clinics for Asian Patients in ${cityName}, ${stateCode}`,
    description: `Find ${specialtyName.toLowerCase()} clinics in ${cityName}, ${stateCode} with Vietnamese, Korean, Chinese, and other Asian-language support.`,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: `${specialtyName} clinics in ${cityName}, ${stateCode}`,
      description: `Compare local clinics by language, specialty, reviews, and contact details.`,
      url: absoluteUrl(path),
    },
  };
}

export default async function SpecialtyLandingPage({ params }: SpecialtyPageProps) {
  const { state, city, specialty } = await params;
  const known = await resolveSpecialtyCombo(state, city, specialty);
  const cityName = known?.city ?? unslugifySegment(city);
  const specialtyName = known?.specialty ?? unslugifySegment(specialty);
  const stateCode = known?.state ?? stateSlugToCode(state);
  const data = await getDirectoryData({ city: cityName, state: stateCode, specialty: specialtyName });

  if (data.total === 0) {
    notFound();
  }

  const path = specialtyRoute(stateCode, cityName, specialtyName);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${specialtyName} clinics in ${cityName}, ${stateCode}`,
    url: absoluteUrl(path),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: absoluteUrl('/'),
    },
    about: `${specialtyName} care for Asian American patients in ${cityName}, ${stateCode}`,
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <DirectoryPage
        data={data}
        intro={{
          eyebrow: 'Local healthcare directory',
          title: `${specialtyName} Clinics in ${cityName}, ${stateCode}`,
          lede: `Find local ${specialtyName.toLowerCase()} providers with language access and culturally aware support for Asian American patients.`,
          back: { href: `/${state}/${city}`, label: `Back to ${cityName}` },
        }}
      />
    </>
  );
}
