import Link from 'next/link';
import { ClinicImage } from '@/components/clinic/clinic-image';
import type { Clinic } from '@/types/database';

interface ClinicCardProps {
  clinic: Clinic;
}

export function ClinicCard({ clinic }: ClinicCardProps) {
  const m = clinic.metadata || {};
  const rating = m.review_profile?.rating ?? m.rating ?? 0;
  const ratingCount = m.review_profile?.review_count ?? m.rating_count ?? 0;
  const hasRating = rating > 0;
  const imageSrc = m.images?.[0] || m.gallery_images?.[0] || null;
  const priceTier = m.price_tier || '$$';
  const locationsCount = m.locations?.length || 1;
  const deliveryLabel = clinic.is_telehealth_available ? 'In person & Telehealth' : 'In person';
  const locationText = [clinic.city, clinic.state].filter(Boolean).join(', ');

  const summaryText =
    m.short_description ||
    m.about_highlight ||
    clinic.description ||
    `${clinic.name} provides culturally informed ${(clinic.specialty || 'primary care').toLowerCase()} services${
      locationText ? ` in ${locationText}` : ' across the United States'
    }${
      clinic.languages.length > 0 ? `, with bilingual support in ${clinic.languages.join(', ')}` : ''
    }.`;

  return (
    <Link href={`/clinics/${clinic.slug || clinic.id}`} className="lg-dir-card">
      <div className="lg-dir-card-media">
        <ClinicImage
          src={imageSrc}
          alt={clinic.name}
          className="h-full w-full"
          iconClassName="h-10 w-10"
        />
        {locationText && (
          <span className="lg-dir-card-corner">
            <span>{locationText}</span>
            <span aria-hidden="true">↗</span>
          </span>
        )}
      </div>

      <div className="lg-dir-card-body">
        {/* Title + Delivery Pill */}
        <div className="lg-dir-card-head">
          <h3 className="lg-dir-card-title">{clinic.name}</h3>
          <span className="lg-dir-card-mode">{deliveryLabel}</span>
        </div>

        {/* Green Meta Line ($$ · ★ 5.0 (8,573 reviews) · Specialty) */}
        <p className="lg-dir-card-meta">
          <span>{priceTier}</span>
          {hasRating && (
            <>
              <span className="dot">·</span>
              <span>
                ★ {rating.toFixed(1)}
                {ratingCount > 0 ? ` (${ratingCount.toLocaleString('en-US')} reviews)` : ''}
              </span>
            </>
          )}
          {clinic.specialty && (
            <>
              <span className="dot">·</span>
              <span>{clinic.specialty}</span>
            </>
          )}
        </p>

        {/* Description Snippet */}
        <p className="lg-dir-card-desc line-clamp-3">{summaryText}</p>

        {/* Bottom Location & Language Box (Longevity style) */}
        <div className="lg-dir-card-box">
          <div className="loc">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#024E44"
              strokeWidth="2"
              className="shrink-0"
              aria-hidden="true"
            >
              <path d="M3 21h18" />
              <path d="M5 21V7l8-4v18" />
              <path d="M19 21V11l-6-4" />
              <path d="M9 9v.01" />
              <path d="M9 12v.01" />
              <path d="M9 15v.01" />
              <path d="M9 18v.01" />
            </svg>
            <span className="truncate">
              {locationsCount > 1
                ? `${locationsCount} in-person locations`
                : locationText
                  ? `1 in-person location · ${locationText}`
                  : '1 in-person location'}
            </span>
          </div>

          {clinic.languages.length > 0 && (
            <div className="langs">
              {clinic.languages.slice(0, 2).map((lang) => (
                <span key={lang}>{lang}</span>
              ))}
              {clinic.languages.length > 2 && (
                <span>+{clinic.languages.length - 2}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
