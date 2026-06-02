import Link from 'next/link';
import { ClinicImage } from '@/components/clinic/clinic-image';
import type { Clinic } from '@/types/database';

interface ClinicCardProps {
  clinic: Clinic;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill={star <= Math.round(rating) ? '#F59E0B' : 'none'}
          stroke="#F59E0B"
          strokeWidth="1.5"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

export function ClinicCard({ clinic }: ClinicCardProps) {
  const rating = clinic.metadata?.rating || 0;
  const hasRating = rating > 0;
  const imageSrc = clinic.metadata?.images?.[0] || null;

  return (
    <Link href={`/clinics/${clinic.slug || clinic.id}`} className="block group">
      <div className="brand-card h-full flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--ahh-deep-teal)]/30 hover:shadow-md">
        <ClinicImage
          src={imageSrc}
          alt={clinic.name}
          className="aspect-[4/3] flex-shrink-0"
          iconClassName="h-10 w-10"
        />

        <div className="p-4 flex flex-col flex-grow">
          {/* Rating */}
          <div className="flex items-center justify-between mb-2">
            {hasRating ? (
              <div className="flex items-center gap-1.5">
                <StarRating rating={rating} />
                <span className="text-xs font-medium text-gray-600">{rating.toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400">No ratings yet</span>
            )}
            
            {/* View Profile label */}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 group-hover:text-[var(--ahh-blue)] transition-colors">
              View Profile
            </span>
          </div>

          {/* Title */}
          <h3 className="font-bold text-[var(--ahh-ink)] group-hover:text-[var(--ahh-blue)] transition-colors line-clamp-1 mb-1">
            {clinic.name}
          </h3>

          {/* Specialty & Location */}
          <p className="text-xs text-gray-500 mb-3 line-clamp-1">
            {clinic.specialty || 'General Practice'} • {clinic.city}, {clinic.state}
          </p>

          {/* Address / Distance (Mocked icon) */}
          <div className="flex items-start gap-1.5 mt-auto pt-2 border-t border-gray-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="1.5" className="shrink-0 mt-0.5">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <span className="text-xs text-gray-500 line-clamp-1">
              {[clinic.address, clinic.city, clinic.state].filter(Boolean).join(', ')}
            </span>
          </div>

          {/* Tags */}
          {(clinic.languages.length > 0 || clinic.specialty) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {clinic.languages.slice(0, 2).map((lang) => (
                <span key={lang} className="brand-chip rounded-md px-2 py-0.5 text-[10px]">
                  <span className="w-2 h-2 rounded-full bg-[var(--ahh-blue)] opacity-70" />
                  {lang}
                </span>
              ))}
              {clinic.specialty && (
                <span className="brand-chip rounded-md px-2 py-0.5 text-[10px]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  {clinic.specialty}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
