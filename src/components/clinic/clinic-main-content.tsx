'use client';

import { useState } from 'react';
import type { Clinic, PricingItem, Review, ServiceOffering } from '@/types/database';

interface ClinicMainContentProps {
  clinic: Clinic;
}

const FALLBACK_ABOUT =
  'We are a community-focused healthcare provider dedicated to delivering comprehensive and compassionate care in a welcoming environment.';

const POSITIVE_REVIEW_THEME_RULES: Array<[string, string[]]> = [
  ['Compassionate care', ['compassion', 'kind', 'caring', 'care', 'patient']],
  ['Friendly staff', ['friendly', 'welcoming', 'staff', 'team', 'front desk']],
  ['Clear explanations', ['explain', 'answered', 'thorough', 'informative', 'detail']],
  ['Comfortable visits', ['comfortable', 'gentle', 'relaxed', 'pain free', 'easy']],
  ['Strong results', ['result', 'improved', 'beautiful', 'recommend', 'excellent']],
];

const SECTION_LINKS = [
  ['about', 'About'],
  ['highlights', 'Highlights'],
  ['insurance', 'Insurance'],
  ['services', 'Services'],
  ['team', 'Team'],
  ['pricing', 'Pricing'],
  ['location', 'Location'],
  ['reviews', 'Reviews'],
];

function asServiceOffering(service: ServiceOffering | string): ServiceOffering {
  return typeof service === 'string' ? { name: service } : service;
}

function paragraphLines(value?: string | null) {
  return (value || FALLBACK_ABOUT)
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatRating(value?: number | null) {
  return typeof value === 'number' && value > 0 ? value.toFixed(1) : null;
}

function inferReviewThemes(reviews: Review[], limit = 4) {
  const reviewText = reviews
    .map((review) => review.text || '')
    .join(' ')
    .toLowerCase();

  if (!reviewText) {
    return [];
  }

  return POSITIVE_REVIEW_THEME_RULES
    .filter(([, keywords]) => keywords.some((keyword) => reviewText.includes(keyword)))
    .map(([label]) => label)
    .slice(0, limit);
}

function summarizeReviews({
  clinicName,
  rating,
  ratingCount,
  explicitSummary,
  reviews,
  themes,
}: {
  clinicName: string;
  rating: number;
  ratingCount: number;
  explicitSummary?: string | null;
  reviews: Review[];
  themes: string[];
}) {
  if (explicitSummary?.trim()) {
    return explicitSummary.trim();
  }

  const ratingText = formatRating(rating);
  const reviewCountText = ratingCount > 0 ? ` from ${ratingCount} patient reviews` : '';
  const themeText = themes.length > 0 ? ` Common themes include ${themes.map((theme) => theme.toLowerCase()).join(', ')}.` : '';

  if (ratingText) {
    return `${clinicName} has a ${ratingText} star rating${reviewCountText}.${themeText}`;
  }

  if (reviews.length > 0 && themes.length > 0) {
    return `Patient reviews for ${clinicName} highlight ${themes.map((theme) => theme.toLowerCase()).join(', ')}.`;
  }

  if (reviews.length > 0) {
    return `Recent patient reviews are available for ${clinicName}. Read the excerpts below for patient experience details.`;
  }

  return null;
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={star <= Math.round(rating) ? '#F59E0B' : 'none'}
          stroke="#F59E0B"
          strokeWidth="1.6"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const rating = typeof review.rating === 'number' ? review.rating : 0;

  return (
    <article className="rounded-xl border border-gray-150 p-5 bg-gray-50/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ahh-ink)]">{review.author || 'Patient'}</p>
          {review.date && <p className="text-xs text-gray-400 mt-0.5">{review.date.slice(0, 10)}</p>}
        </div>
        {rating > 0 && <StarRow rating={rating} size={12} />}
      </div>
      {review.text && <p className="text-xs leading-relaxed text-gray-600">&ldquo;{review.text}&rdquo;</p>}
    </article>
  );
}

function PricingRow({ item }: { item: PricingItem }) {
  const price = item.price || item.price_range || 'Contact clinic';

  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="py-3.5 px-4 align-top">
        <p className="text-sm font-semibold text-[var(--ahh-ink)]">{item.name}</p>
        {item.category && <p className="mt-1 text-xs text-gray-500">{item.category}</p>}
      </td>
      <td className="py-3.5 px-4 align-top text-sm font-semibold text-[var(--ahh-blue)]">{price}</td>
      <td className="py-3.5 px-4 align-top text-xs leading-relaxed text-[var(--ahh-muted)]">{item.notes || 'Verify with clinic before booking.'}</td>
    </tr>
  );
}

function getHighlightIcon(categoryOrTitle: string) {
  const norm = (categoryOrTitle || '').toLowerCase();
  if (norm.includes('language') || norm.includes('bilingual') || norm.includes('staff') || norm.includes('culture') || norm.includes('interpreter') || norm.includes('vietnamese') || norm.includes('korean')) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="m5 8 6 12m1-12 6 12M2 12h20"/></svg>
    );
  }
  if (norm.includes('appointment') || norm.includes('schedule') || norm.includes('same-day') || norm.includes('convenience') || norm.includes('hours') || norm.includes('open') || norm.includes('saturday')) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
    );
  }
  if (norm.includes('medicaid') || norm.includes('medicare') || norm.includes('insurance') || norm.includes('pay') || norm.includes('cost') || norm.includes('price')) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
    );
  }
  if (norm.includes('care') || norm.includes('specialty') || norm.includes('doctor') || norm.includes('dentist') || norm.includes('pediatric')) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
    );
  }
  if (norm.includes('bed') || norm.includes('beds') || norm.includes('hospital')) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 14h20M6 8v6"/></svg>
    );
  }
  if (norm.includes('visit') || norm.includes('visits') || norm.includes('year') || norm.includes('count')) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    );
  }
  // Default heart/care icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  );
}

export function ClinicMainContent({ clinic }: ClinicMainContentProps) {
  const metadata = clinic.metadata || {};
  const highlights = metadata.highlights || [];
  const serviceItems = (metadata.services_offered?.length ? metadata.services_offered : metadata.services || [])
    .map(asServiceOffering)
    .filter((service) => service.name);
  const teamMembers = metadata.team_members || [];
  const insurance = metadata.insurance;
  const insuranceNetworks = insurance?.accepted_networks?.length
    ? insurance.accepted_networks
    : metadata.insurance_accepted || [];
  const pricing = metadata.pricing || [];
  const reviewProfile = metadata.review_profile;
  const rating = reviewProfile?.rating ?? metadata.rating ?? 0;
  const ratingCount = reviewProfile?.review_count ?? metadata.rating_count ?? 0;
  const reviews = reviewProfile?.featured_reviews?.length ? reviewProfile.featured_reviews : metadata.reviews || [];
  const reviewThemes = reviewProfile?.positive_themes?.length ? reviewProfile.positive_themes : inferReviewThemes(reviews);
  
  // Parse structured AI themes
  const rawThemes = reviewProfile?.themes || [];
  const reviewThemesList = rawThemes.length > 0 
    ? rawThemes 
    : (reviewThemes || []).map((t: string) => ({
        theme: t,
        sentiment: 'Positive',
        mentions: 3,
        summary_quote: `Patients frequently mention ${t.toLowerCase()} in their feedback.`
      }));

  const reviewSummary = summarizeReviews({
    clinicName: clinic.name,
    rating,
    ratingCount,
    explicitSummary: reviewProfile?.summary || metadata.review_summary,
    reviews,
    themes: reviewThemes,
  });
  const location = metadata.location;
  const addressString = [
    location?.address || clinic.address,
    location?.city || clinic.city,
    location?.state || clinic.state,
    location?.zip_code || clinic.zip_code,
  ]
    .filter(Boolean)
    .join(', ');

  const aboutText = metadata.about_highlight || clinic.description || FALLBACK_ABOUT;
  const culturalContext = metadata.cultural_context || metadata.language_note;

  // Find ratings from other sources
  const thirdPartyProfiles = metadata.third_party_profiles || [];
  
  // Primary (Google) rating
  const googleRating = reviewProfile?.rating ?? metadata.rating ?? 0;
  const googleCount = reviewProfile?.review_count ?? metadata.rating_count ?? 0;
  const googleUrl = metadata.google_maps_url || '#';

  // Yelp rating
  const yelpProfile = thirdPartyProfiles.find((p: any) => p && p.source === 'yelp');
  const yelpRating = yelpProfile?.rating ?? null;
  const yelpCount = yelpProfile?.review_count ?? null;
  const yelpUrl = yelpProfile?.url || undefined;

  // Zocdoc rating
  const zocdocProfile = thirdPartyProfiles.find((p: any) => p && p.source === 'zocdoc');
  const zocdocRating = zocdocProfile?.rating ?? null;
  const zocdocCount = zocdocProfile?.review_count ?? null;
  const zocdocUrl = zocdocProfile?.url || undefined;

  return (
    <main className="min-w-0 flex-1 space-y-8">
      {/* Sticky Tab Navigation */}
      <nav className="sticky top-4 z-20 flex gap-6 overflow-x-auto border border-gray-150 rounded-xl bg-white px-6 py-3.5 text-xs font-bold text-gray-500 shadow-sm scrollbar-none">
        {SECTION_LINKS.map(([id, label]) => {
          return (
            <a 
              key={id} 
              href={`#${id}`} 
              className="whitespace-nowrap py-1 hover:text-[var(--ahh-deep-teal)] transition-colors cursor-pointer"
            >
              {label}
            </a>
          );
        })}
      </nav>

      {/* About Section Card */}
      <section id="about" className="scroll-mt-24 bg-white rounded-2xl border border-gray-150 p-6 md:p-8 space-y-6 shadow-3xs">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--ahh-blue)]">About</p>
          <h2 className="mt-2 text-2xl font-bold text-[var(--ahh-ink)]">{clinic.name}</h2>
        </div>
        <div className="space-y-4">
          {paragraphLines(aboutText).map((paragraph) => (
            <p key={paragraph} className="brand-body-copy text-sm leading-7 text-gray-600">
              {paragraph}
            </p>
          ))}
          {culturalContext && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3.5 text-sm leading-6 text-[var(--ahh-deep-teal)] flex gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5 text-emerald-700"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span className="font-semibold text-emerald-900">{culturalContext}</span>
            </div>
          )}
        </div>
      </section>

      {/* Highlights Section Card */}
      <section id="highlights" className="scroll-mt-24 bg-white rounded-2xl border border-gray-150 p-6 md:p-8 space-y-6 shadow-3xs">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Highlights</h3>
        {highlights.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map((highlight) => {
              const icon = getHighlightIcon(highlight.category || highlight.title);
              return (
                <article key={`${highlight.title}-${highlight.category}`} className="rounded-xl border border-gray-100 bg-gray-50/30 p-5 hover:border-gray-200 transition-colors flex flex-col justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--ahh-blue)] shrink-0 shadow-3xs">
                      {icon}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--ahh-ink)] leading-snug">{highlight.title}</p>
                      {highlight.category && <p className="text-4xs font-bold uppercase tracking-wider text-gray-400 mt-0.5">{highlight.category}</p>}
                    </div>
                  </div>
                  {highlight.detail && <p className="text-xs leading-relaxed text-[var(--ahh-muted)] mt-3 pt-3 border-t border-gray-100/50">{highlight.detail}</p>}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--ahh-muted)]">No highlights are currently listed for this clinic.</p>
        )}
      </section>

      {/* Insurance Section Card */}
      <section id="insurance" className="scroll-mt-24 bg-white rounded-2xl border border-gray-150 p-6 md:p-8 space-y-6 shadow-3xs">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Insurance Accepted</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {insuranceNetworks.length > 0 ? (
            insuranceNetworks.map((network) => (
              <div key={network} className="rounded-xl border border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 bg-gray-50/20 flex items-center gap-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-600 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                <span>{network}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--ahh-muted)]">Insurance networks were not listed. Verify coverage directly before booking.</p>
          )}
        </div>
        {insurance && (
          <div className="grid gap-3 sm:grid-cols-3 pt-2">
            <div className="rounded-xl bg-gray-50/40 border border-gray-100 p-4 text-xs font-bold text-gray-600 flex justify-between items-center">
              <span>Medicaid</span>
              <span className={`px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider ${insurance.accepts_medicaid ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-500'}`}>{insurance.accepts_medicaid ? 'Accepted' : 'Verify'}</span>
            </div>
            <div className="rounded-xl bg-gray-50/40 border border-gray-100 p-4 text-xs font-bold text-gray-600 flex justify-between items-center">
              <span>Medicare</span>
              <span className={`px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider ${insurance.accepts_medicare ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-500'}`}>{insurance.accepts_medicare ? 'Accepted' : 'Verify'}</span>
            </div>
            <div className="rounded-xl bg-gray-50/40 border border-gray-100 p-4 text-xs font-bold text-gray-600 flex justify-between items-center">
              <span>Private Insurance</span>
              <span className={`px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider ${insurance.accepts_private_insurance ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-500'}`}>{insurance.accepts_private_insurance ? 'Accepted' : 'Verify'}</span>
            </div>
          </div>
        )}
        {insurance?.notes && <p className="text-xs leading-relaxed text-[var(--ahh-muted)] border-t border-gray-100 pt-4">{insurance.notes}</p>}
      </section>

      {/* Services Section Card */}
      <section id="services" className="scroll-mt-24 bg-white rounded-2xl border border-gray-150 p-6 md:p-8 space-y-6 shadow-3xs">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Services</h3>
        {serviceItems.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {serviceItems.map((service) => (
              <article key={`${service.name}-${service.category || ''}`} className="rounded-xl border border-gray-100 p-5 hover:border-gray-200 transition-colors bg-white shadow-4xs flex flex-col justify-between">
                <div>
                  <div className="mb-3 flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-[var(--ahh-ink)]">{service.name}</p>
                      {service.category && <p className="mt-1 text-3xs font-bold text-blue-600 uppercase tracking-wider">{service.category}</p>}
                    </div>
                  </div>
                  {service.description && <p className="text-xs leading-relaxed text-[var(--ahh-muted)]">{service.description}</p>}
                </div>
                {service.patient_fit && (
                  <div className="mt-3 border-t border-gray-50 pt-2 text-3xs text-gray-400 font-medium italic">
                    Ideal for: {service.patient_fit}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--ahh-muted)]">No services are currently listed. Contact the clinic for more information.</p>
        )}
      </section>

      {/* Team Section Card */}
      <section id="team" className="scroll-mt-24 bg-white rounded-2xl border border-gray-150 p-6 md:p-8 space-y-6 shadow-3xs">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Meet the Team</h3>
        {teamMembers.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <article key={`${member.name}-${member.role || ''}`} className="rounded-xl border border-gray-100 p-5 text-center bg-gray-50/20 flex flex-col justify-between items-center space-y-3">
                <div className="flex flex-col items-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 border border-blue-100 text-base font-bold text-[var(--ahh-blue)] shadow-4xs">
                    {member.name.charAt(0)}
                  </div>
                  <p className="text-sm font-bold text-[var(--ahh-ink)]">{member.name}</p>
                  {member.role && <p className="mt-0.5 text-xs font-semibold text-[var(--ahh-blue)]">{member.role}</p>}
                </div>
                {member.bio_snippet && <p className="text-3xs leading-relaxed text-[var(--ahh-muted)] italic">&ldquo;{member.bio_snippet}&rdquo;</p>}
                {member.languages_spoken && member.languages_spoken.length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-center pt-2">
                    {member.languages_spoken.map((lang: string) => (
                      <span key={lang} className="text-4xs font-bold uppercase tracking-wider bg-white border border-gray-150 text-gray-500 rounded-full px-2 py-0.5">{lang}</span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--ahh-muted)]">No team members are currently listed. Contact the clinic for details on their providers.</p>
        )}
      </section>

      {/* Pricing Section Card */}
      <section id="pricing" className="scroll-mt-24 bg-white rounded-2xl border border-gray-150 p-6 md:p-8 space-y-6 shadow-3xs">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Pricing</h3>
        {pricing.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-bold">Service</th>
                  <th className="px-4 py-3 font-bold">Price</th>
                  <th className="px-4 py-3 font-bold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 bg-white">
                {pricing.map((item) => (
                  <PricingRow key={`${item.name}-${item.price || item.price_range || ''}`} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--ahh-muted)]">Pricing was not listed. Contact the clinic for current estimates and insurance guidance.</p>
        )}
      </section>

      {/* Location Section Card */}
      <section id="location" className="scroll-mt-24 bg-white rounded-2xl border border-gray-150 p-6 md:p-8 space-y-6 shadow-3xs">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Location & Accessibility</h3>
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-6 text-gray-800 space-y-4 shadow-4xs">
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="2.5" className="shrink-0 mt-0.5 text-blue-600"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Address</p>
              <p className="text-sm font-semibold mt-1 text-gray-800">{addressString || 'Address unavailable'}</p>
            </div>
          </div>
          {(location?.parking || location?.transit || (location?.nearby_landmarks && location.nearby_landmarks.length > 0)) && (
            <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-gray-200">
              {location?.parking && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Parking</p>
                  <p className="text-xs font-semibold text-gray-600 mt-1">{location.parking}</p>
                </div>
              )}
              {location?.transit && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Public Transit</p>
                  <p className="text-xs font-semibold text-gray-600 mt-1">{location.transit}</p>
                </div>
              )}
              {location?.nearby_landmarks && location.nearby_landmarks.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Nearby Landmarks</p>
                  <p className="text-xs font-semibold text-gray-600 mt-1">{location.nearby_landmarks.join(', ')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Reviews Section Card */}
      <section id="reviews" className="scroll-mt-24 bg-white rounded-2xl border border-gray-150 p-6 md:p-8 space-y-6 shadow-3xs">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Reviews</h3>
        
        {/* Rating Profiles Row */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Google Places Card */}
          <a
            href={googleUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-gray-150 p-5 shadow-4xs bg-white hover:shadow-md transition-shadow duration-200 flex flex-col justify-between cursor-pointer"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Google</p>
              <p className="text-3xl font-extrabold text-gray-900">{googleRating > 0 ? googleRating.toFixed(1) : '—'}</p>
              {googleRating > 0 && (
                <div className="mt-1.5">
                  <StarRow rating={googleRating} />
                </div>
              )}
            </div>
            <p className="text-3xs font-semibold text-gray-400 mt-4">{googleCount ? `${googleCount} reviews` : 'No reviews listed'}</p>
          </a>

          {/* Yelp Card */}
          <a
            href={yelpUrl || '#'}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => !yelpUrl && e.preventDefault()}
            className={`rounded-2xl border border-gray-150 p-5 shadow-4xs bg-white hover:shadow-md transition-shadow duration-200 flex flex-col justify-between ${
              yelpUrl ? 'cursor-pointer' : 'cursor-default opacity-60'
            }`}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Yelp</p>
              <p className="text-3xl font-extrabold text-gray-900">{yelpRating ? yelpRating.toFixed(1) : '—'}</p>
              {yelpRating && (
                <div className="mt-1.5">
                  <StarRow rating={yelpRating} />
                </div>
              )}
            </div>
            <p className="text-3xs font-semibold text-gray-400 mt-4">{yelpCount ? `${yelpCount} reviews` : 'No reviews listed'}</p>
          </a>

          {/* Zocdoc Card */}
          <a
            href={zocdocUrl || '#'}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => !zocdocUrl && e.preventDefault()}
            className={`rounded-2xl border border-gray-150 p-5 shadow-4xs bg-white hover:shadow-md transition-shadow duration-200 flex flex-col justify-between ${
              zocdocUrl ? 'cursor-pointer' : 'cursor-default opacity-60'
            }`}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Zocdoc</p>
              <p className="text-3xl font-extrabold text-gray-900">{zocdocRating ? zocdocRating.toFixed(1) : '—'}</p>
              {zocdocRating && (
                <div className="mt-1.5">
                  <StarRow rating={zocdocRating} />
                </div>
              )}
            </div>
            <p className="text-3xs font-semibold text-gray-400 mt-4">{zocdocCount ? `${zocdocCount} reviews` : 'No reviews listed'}</p>
          </a>
        </div>

        {/* AI Review Summary (Editorial) */}
        {reviewSummary && (
          <div className="rounded-xl border border-blue-50 bg-blue-50/30 p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-[var(--ahh-blue)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.32 11.32l.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>
              <p className="text-xs font-bold uppercase tracking-wider">AI Review Summary</p>
            </div>
            <p className="text-xs leading-relaxed text-gray-700">{reviewSummary}</p>
          </div>
        )}

        {/* Patient Mention Theme Cards Grid */}
        {reviewThemesList.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">What people mention</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {reviewThemesList.map((item: any, idx: number) => {
                const isPositive = String(item.sentiment || '').toLowerCase() === 'positive';
                return (
                  <div
                    key={`${item.theme}-${idx}`}
                    className="rounded-2xl border border-gray-150 bg-white p-5 shadow-5xs hover:shadow-md transition-shadow duration-200 flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h5 className="text-sm font-bold text-gray-900">{item.theme}</h5>
                        <p className="text-2xs text-gray-400 font-medium mt-0.5">{item.mentions || 2} mentions</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-3xs font-bold tracking-wide uppercase ${
                          isPositive
                            ? 'bg-green-50 text-green-700 border border-green-100'
                            : 'bg-red-50 text-red-700 border border-red-100'
                        }`}
                      >
                        {item.sentiment || 'Positive'}
                      </span>
                    </div>
                    {item.summary_quote && (
                      <blockquote className="border-l-2 border-green-500 pl-3 py-0.5 text-xs text-gray-500 italic leading-relaxed">
                        &ldquo;{item.summary_quote}&rdquo;
                      </blockquote>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Review list cards if any */}
        {reviews.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Patient Testimonials</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {reviews.slice(0, 4).map((review: any, idx: number) => (
                <ReviewCard key={idx} review={review} />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
