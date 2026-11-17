import type { Metadata } from 'next';
import { SearchEventTracker } from '@/components/search/search-event-tracker';
import { DirectoryPage } from '@/components/site/directory';
import type { DirectoryParams } from '@/components/site/types';
import { getDirectoryData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

interface SearchPageProps {
  searchParams: Promise<DirectoryParams>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const parts: string[] = [];
  if (params.language) parts.push(params.language);
  if (params.specialty) parts.push(params.specialty);
  if (params.city) parts.push(`in ${params.city.replace(/,/g, ', ')}`);

  const title = parts.length > 0
    ? `${parts.join(' ')} Clinics`
    : 'Find Asian Clinics';

  return {
    title,
    description: `Search ${title.toLowerCase()} that speak your language. Browse verified profiles with reviews, hours, insurance coverage, and contact info.`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const data = await getDirectoryData(params);

  return (
    <>
      <SearchEventTracker
        query={params.query}
        resultCount={data.total}
        filters={{
          language: params.language,
          specialty: params.specialty,
          city: params.city,
          insurance: params.insurance,
        }}
      />
      <DirectoryPage data={data} />
    </>
  );
}
