import { ClinicImage } from '@/components/clinic/clinic-image';
import type { Clinic } from '@/types/database';

interface ClinicHeroProps {
  clinic: Clinic;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
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

export function ClinicHero({ clinic }: ClinicHeroProps) {
  const rating = clinic.metadata?.rating || 0;
  const imageSrc = clinic.metadata?.images?.[0] || null;

  return (
    <section className="bg-[var(--ahh-blue)] pt-12 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        
        {/* Left Content */}
        <div className="flex-1">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            {clinic.name}
          </h1>
          <p className="text-blue-100 text-sm md:text-base max-w-2xl mb-4">
            {clinic.description || `${clinic.name} is a trusted ${clinic.specialty?.toLowerCase() || 'primary care'} clinic in ${clinic.city}.`}
          </p>

          {/* Rating */}
          <div className="flex items-center gap-2 mb-6">
            <StarRating rating={rating} />
            <span className="text-sm font-semibold text-white">{rating.toFixed(1)}</span>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-blue-50 mb-8">
            {clinic.specialty && (
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                {clinic.specialty}
              </div>
            )}
            
            <div className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              {clinic.city}, {clinic.state}
            </div>

            {clinic.languages.length > 0 && (
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
                {clinic.languages.join(', ')}
              </div>
            )}

            {clinic.is_telehealth_available && (
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                Telehealth Available
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <a
              href={clinic.phone ? `tel:${clinic.phone.replace(/[^0-9]/g, '')}` : '#'}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg bg-white text-[var(--ahh-blue)] hover:bg-gray-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Call Clinic
            </a>
            
            {clinic.org_id && (
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg border-2 border-white/30 text-white hover:bg-white/10 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                Visit Website
              </a>
            )}
          </div>
        </div>

        <ClinicImage
          src={imageSrc}
          alt={clinic.name}
          className="w-full md:w-80 lg:w-96 aspect-[4/3] rounded-2xl shrink-0 border border-white/20 bg-white/10"
          iconClassName="h-16 w-16 text-white opacity-40"
        />

      </div>
    </section>
  );
}
