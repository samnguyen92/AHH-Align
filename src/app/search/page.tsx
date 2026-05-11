import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchFilters } from '@/components/search/search-filters';
import { ClinicGrid } from '@/components/search/clinic-grid';
import { SearchPagination } from '@/components/search/pagination';
import { searchClinics } from '@/services/clinic-service';

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

  return (
    <>
      {/* Blue Hero */}
      <section className="bg-[var(--ahh-blue)] py-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            Find an Asian Clinic<br />That Speaks Your Language
          </h1>
          <p className="mt-2 text-sm text-blue-100 max-w-lg">
            Asian Health Hub connects Vietnamese and Korean-speaking patients with trusted clinics across the United States. Search by specialty, city, or language.
          </p>
        </div>
      </section>

      {/* Search Bar */}
      <section className="bg-white border-b border-gray-100 py-4 px-4 sm:px-6 lg:px-8 shadow-sm">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col sm:flex-row items-stretch gap-2 bg-gray-50 rounded-xl p-2">
            <div className="flex-[2] relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                type="text"
                placeholder="Search by specialty, clinic name, or keyword..."
                defaultValue={params.query ?? ''}
                className="w-full h-10 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 bg-transparent border-0 outline-none"
                readOnly
              />
            </div>
            <span className="hidden sm:flex items-center text-xs text-gray-400 px-3 border-l border-gray-200">Specialty</span>
            <span className="hidden sm:flex items-center text-xs text-gray-400 px-3 border-l border-gray-200">City</span>
            <span className="hidden sm:flex items-center text-xs text-gray-400 px-3 border-l border-gray-200">Language</span>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Explore Clinics</h2>
            <span className="text-sm text-gray-500">
              Found <span className="font-semibold text-[var(--ahh-blue)]">{result.total.toLocaleString()}</span> results
            </span>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Filters Sidebar */}
            <Suspense fallback={null}>
              <SearchFilters />
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
    </>
  );
}
