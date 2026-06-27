import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchFilters } from '@/components/search/search-filters';
import { ClinicGrid } from '@/components/search/clinic-grid';
import { SearchPagination } from '@/components/search/pagination';
import { searchClinics, getSearchFilterOptions } from '@/services/clinic-service';
import { DirectorySearchBar } from '@/components/search/directory-search-bar';

interface SearchPageProps {
  searchParams: Promise<{
    city?: string;
    state?: string;
    specialty?: string;
    language?: string;
    query?: string;
    page?: string;
  }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const parts: string[] = [];
  if (params.language) parts.push(params.language);
  if (params.specialty) parts.push(params.specialty);
  if (params.city) parts.push(`in ${params.city}`);

  const title = parts.length > 0
    ? `${parts.join(' ')} Clinics`
    : 'Find Asian Clinics';

  return {
    title,
    description: `Search ${title.toLowerCase()} that speak your language. Browse verified profiles with reviews, hours, and contact info.`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const result = await searchClinics({
    city: params.city,
    state: params.state,
    specialty: params.specialty,
    language: params.language,
    query: params.query,
    page,
    limit: 12,
  });

  const totalPages = Math.ceil(result.total / result.limit);
  const filterOptions = await getSearchFilterOptions();

  return (
    <main className="bg-[#E5F0EB] px-[10px] pb-[10px]">
      <div className="home-shell">
      {/* Search Hero */}
      <section className="pt-0">
        <div className="brand-hero px-6 pb-12 pt-28 sm:px-10 lg:px-20 lg:pt-32">
          <h1 className="brand-heading-1 text-white">
            Find an Asian Clinic<br />That Speaks Your Language
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
            Asian Health Hub connects Vietnamese and Korean-speaking patients with trusted clinics across the United States. Search by specialty, city, or language.
          </p>
        </div>
      </section>

      {/* Search Bar */}
      <section className="relative z-10 -mt-5 px-4 sm:px-8 lg:px-16">
        <Suspense fallback={
          <div className="brand-input-shell mx-auto max-w-[1360px] p-2 bg-white rounded-lg h-14 animate-pulse" />
        }>
          <DirectorySearchBar />
        </Suspense>
      </section>

      {/* Main Content */}
      <section className="home-section rounded-[16px] bg-[var(--ahh-mist-2)] px-5 pb-16 pt-12 sm:px-10 lg:px-20">
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="brand-heading-2 text-[var(--ahh-ink)]">Explore Clinics</h2>
            <span className="text-sm text-gray-500">
              Found <span className="font-semibold text-[var(--ahh-blue)]">{result.total.toLocaleString()}</span> results
            </span>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            <Suspense fallback={null}>
              <SearchFilters
                specialties={filterOptions.specialties}
                languages={filterOptions.languages}
                cities={filterOptions.cities}
              />
            </Suspense>

            {/* Results Grid */}
            <div className="flex-1 min-w-0">
              <ClinicGrid clinics={result.data} total={result.total} />

              <Suspense fallback={null}>
                <SearchPagination currentPage={page} totalPages={totalPages} />
              </Suspense>
            </div>
          </div>
        </div>
      </section>
      </div>
    </main>
  );
}
