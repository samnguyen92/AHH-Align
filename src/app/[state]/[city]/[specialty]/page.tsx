import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClinicGrid } from '@/components/search/clinic-grid';
import { JsonLd } from '@/lib/json-ld';
import { absoluteUrl, SITE_NAME } from '@/lib/site';
import {
  specialtyRoute,
  stateSlugToCode,
  unslugifySegment,
} from '@/lib/local-seo';
import {
  getTopSpecialtyCombos,
  searchClinics,
} from '@/services/clinic-service';

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
  const cityName = unslugifySegment(city);
  const specialtyName = unslugifySegment(specialty);
  const stateCode = stateSlugToCode(state);
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
  const cityName = unslugifySegment(city);
  const specialtyName = unslugifySegment(specialty);
  const stateCode = stateSlugToCode(state);
  const result = await searchClinics({
    city: cityName,
    state: stateCode,
    specialty: specialtyName,
    page: 1,
    limit: 12,
  });

  if (result.total === 0) {
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
    <main className="bg-white">
      <JsonLd data={jsonLd} />
      <section className="bg-[var(--ahh-blue)] px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href={`/${state}/${city}`} className="text-sm font-semibold text-blue-100 hover:text-white">
            &larr; Back to {cityName}
          </Link>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            {specialtyName} Clinics in {cityName}, {stateCode}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-blue-100">
            Find local {specialtyName.toLowerCase()} providers with language access and culturally aware support for Asian American patients.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-950">
              {result.total} matching clinic{result.total === 1 ? '' : 's'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Review profiles for languages, ratings, clinic details, and direct contact options.
            </p>
          </div>
          <Link
            href={`/search?city=${encodeURIComponent(cityName)}&state=${stateCode}&specialty=${encodeURIComponent(specialtyName)}`}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--ahh-blue)] px-4 text-sm font-semibold text-white hover:bg-[var(--ahh-blue-dark)]"
          >
            Open filtered search
          </Link>
        </div>

        <ClinicGrid clinics={result.data} total={result.total} />
      </section>
    </main>
  );
}
