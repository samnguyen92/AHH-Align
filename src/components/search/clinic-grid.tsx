import { ClinicCard } from './clinic-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Clinic } from '@/types/database';

interface ClinicGridProps {
  clinics: Clinic[];
  total?: number;
  isLoading?: boolean;
}

export function ClinicGrid({ clinics, isLoading }: ClinicGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="p-4 space-y-3">
              <Skeleton className="h-4 w-1/4" />
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
      <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-gray-100">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No clinics found</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Try adjusting your filters or searching for a different city, specialty, or language.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
      {clinics.map((clinic) => (
        <ClinicCard key={clinic.id} clinic={clinic} />
      ))}
    </div>
  );
}
