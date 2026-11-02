import Link from 'next/link';
import { ClinicCard } from './clinic-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Reveal } from '@/components/lg/motion';
import type { Clinic } from '@/types/database';

interface ClinicGridProps {
  clinics: Clinic[];
  total?: number;
  isLoading?: boolean;
}

export function ClinicGrid({ clinics, isLoading }: ClinicGridProps) {
  if (isLoading) {
    return (
      <div className="lg-dir-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-[20px] border border-[#024E44]/10 overflow-hidden bg-white">
            <Skeleton className="aspect-[16/10] w-full" />
            <div className="p-5 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (clinics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-white rounded-[20px] border border-[#024E44]/12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E5F0EB] text-[#024E44] mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path d="M8 11h6" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[#0D1F1C] mb-1">No matching clinics found</h3>
        <p className="text-sm text-[#5A7A70] max-w-sm mb-5">
          Try clearing one of your active filters or searching for another city, specialty, or language.
        </p>
        <Link href="/search" className="lg-cta lg-cta--ghost">
          <span>Reset all filters</span>
          <span className="arr" aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="lg-dir-grid">
      {clinics.map((clinic, i) => (
        <Reveal key={clinic.id} delay={(i % 6) * 0.05} className="lg-fill">
          <ClinicCard clinic={clinic} />
        </Reveal>
      ))}
    </div>
  );
}
