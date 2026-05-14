import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClinicGrid } from '@/components/search/clinic-grid';
import { JsonLd } from '@/lib/json-ld';
import { absoluteUrl, SITE_NAME } from '@/lib/site';
import { cityRoute, stateSlugToCode, unslugifySegment } from '@/lib/local-seo';
import {
  getTopCityCombos,
  getTopSpecialtyCombos,
  searchClinics,
} from '@/services/clinic-service';

export const revalidate = 86400;

interface CityPageProps {
  params: Promise<{ state: string; city: string }>;
}

export async function generateStaticParams() {
  const cities = await getTopCityCombos(200);
  return cities.map((combo) => ({
    state: combo.stateSlug,
    city: combo.citySlug,
  }));
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { state, city } = await params;
  const cityName = unslugifySegment(city);
  const stateCode = stateSlugToCode(state);
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
  const cityName = unslugifySegment(city);
  const stateCode = stateSlugToCode(state);
  const result = await searchClinics({
    city: cityName,
    state: stateCode,
    page: 1,
    limit: 12,
  });

  if (result.total === 0) {
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
    <main className="bg-white">
      <JsonLd data={jsonLd} />
      <section className="bg-[var(--ahh-blue)] px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">
            Local healthcare directory
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Vietnamese and Asian Doctors in {cityName}, {stateCode}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-blue-100">
            Compare clinics that support Asian American patients with language access, culturally aware care, and local contact information.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 grid gap-4 md:grid-cols-[1fr_260px]">
          <div>
            <h2 className="text-2xl font-bold text-gray-950">
              {result.total} clinic{result.total === 1 ? '' : 's'} near {cityName}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Use this local page to start your search, then open each profile to review languages, specialties, insurance, hours, and contact options.
            </p>
          </div>
          <Link
            href={`/search?city=${encodeURIComponent(cityName)}&state=${stateCode}`}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--ahh-blue)] px-4 text-sm font-semibold text-white hover:bg-[var(--ahh-blue-dark)]"
          >
            Search all filters
          </Link>
        </div>

        {specialties.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            {specialties.map((combo) => (
              <Link
                key={combo.path}
                href={combo.path}
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[var(--ahh-blue)] hover:border-[var(--ahh-blue)]"
              >
                {combo.specialty} in {cityName}
              </Link>
            ))}
          </div>
        )}

        <ClinicGrid clinics={result.data} total={result.total} />
      </section>
    </main>
  );
}
