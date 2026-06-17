import { ClinicImage } from '@/components/clinic/clinic-image';
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
    <article className="rounded-lg border border-gray-200 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ahh-ink)]">{review.author || 'Patient'}</p>
          {review.date && <p className="text-xs text-gray-500">{review.date.slice(0, 10)}</p>}
        </div>
        {rating > 0 && <StarRow rating={rating} size={12} />}
      </div>
      {review.text && <p className="text-sm leading-relaxed text-[var(--ahh-muted)]">&ldquo;{review.text}&rdquo;</p>}
    </article>
  );
}

function PricingRow({ item }: { item: PricingItem }) {
  const price = item.price || item.price_range || 'Contact clinic';

  return (
    <tr className="border-b border-gray-200 last:border-b-0">
      <td className="py-3 pr-4 align-top">
        <p className="text-sm font-semibold text-[var(--ahh-ink)]">{item.name}</p>
        {item.category && <p className="mt-1 text-xs text-gray-500">{item.category}</p>}
      </td>
      <td className="py-3 pr-4 align-top text-sm font-semibold text-[var(--ahh-blue)]">{price}</td>
      <td className="py-3 align-top text-xs leading-relaxed text-[var(--ahh-muted)]">{item.notes || 'Verify with clinic before booking.'}</td>
    </tr>
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
  const reviewSummary = summarizeReviews({
    clinicName: clinic.name,
    rating,
    ratingCount,
    explicitSummary: reviewProfile?.summary || metadata.review_summary,
    reviews,
    themes: reviewThemes,
  });
  const location = metadata.location;
  const galleryImages = [
    ...(metadata.gallery_images || []),
    ...(metadata.images || []),
  ].filter((image, index, images) => image && images.indexOf(image) === index);
  const aboutText = metadata.about_highlight || clinic.description || FALLBACK_ABOUT;
  const culturalContext = metadata.cultural_context || metadata.language_note;
  const addressString = [
    location?.address || clinic.address,
    location?.city || clinic.city,
    location?.state || clinic.state,
    location?.zip_code || clinic.zip_code,
  ]
    .filter(Boolean)
    .join(', ');
  const displayedRating = formatRating(rating);

  return (
    <main className="min-w-0 flex-1 space-y-12">
      {galleryImages.length > 0 && (
        <section aria-label={`${clinic.name} gallery`} className="grid gap-2 sm:grid-cols-3">
          <ClinicImage
            src={galleryImages[0]}
            alt={`${clinic.name} main photo`}
            className="aspect-[16/10] rounded-lg sm:col-span-2 sm:row-span-2 sm:h-full"
          />
          {galleryImages.slice(1, 3).map((image, index) => (
            <ClinicImage
              key={image}
              src={image}
              alt={`${clinic.name} gallery photo ${index + 2}`}
              className="aspect-[16/10] rounded-lg"
            />
          ))}
        </section>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 text-xs font-semibold text-[var(--ahh-muted)]">
        {SECTION_LINKS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="whitespace-nowrap border-b-2 border-transparent px-3 py-3 hover:border-[var(--ahh-blue)] hover:text-[var(--ahh-blue)]">
            {label}
          </a>
        ))}
      </nav>

      <section id="highlights" className="scroll-mt-24 space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--ahh-blue)]">About</p>
          <h2 className="mt-2 text-2xl font-bold text-[var(--ahh-ink)]">{clinic.name}</h2>
        </div>
        <div className="space-y-4">
          {paragraphLines(aboutText).map((paragraph) => (
            <p key={paragraph} className="brand-body-copy text-sm leading-7">
              {paragraph}
            </p>
          ))}
          {culturalContext && (
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-[var(--ahh-deep-teal)]">
              {culturalContext}
            </p>
          )}
        </div>
        {highlights.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {highlights.map((highlight) => (
              <article key={`${highlight.title}-${highlight.category}`} className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm font-semibold text-[var(--ahh-ink)]">{highlight.title}</p>
                {highlight.detail && <p className="mt-2 text-sm leading-6 text-[var(--ahh-muted)]">{highlight.detail}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <hr className="border-gray-100" />

      <section id="insurance" className="scroll-mt-24 space-y-4">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Insurance Accepted</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {insuranceNetworks.length > 0 ? (
            insuranceNetworks.map((network) => (
              <div key={network} className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-[var(--ahh-ink)]">
                {network}
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--ahh-muted)]">Insurance networks were not listed. Verify coverage directly before booking.</p>
          )}
        </div>
        {insurance && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-gray-50 p-4 text-sm">Medicaid: {insurance.accepts_medicaid ? 'Accepted' : 'Not listed'}</div>
            <div className="rounded-lg bg-gray-50 p-4 text-sm">Medicare: {insurance.accepts_medicare ? 'Accepted' : 'Not listed'}</div>
            <div className="rounded-lg bg-gray-50 p-4 text-sm">Private: {insurance.accepts_private_insurance ? 'Accepted' : 'Verify'}</div>
          </div>
        )}
        {insurance?.notes && <p className="text-sm leading-6 text-[var(--ahh-muted)]">{insurance.notes}</p>}
      </section>

      <hr className="border-gray-100" />

      <section id="services" className="scroll-mt-24 space-y-4">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Services</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {serviceItems.map((service) => (
            <article key={`${service.name}-${service.category || ''}`} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-start gap-3">
                <span className="mt-1 h-4 w-4 rounded border border-blue-200 bg-blue-50" />
                <div>
                  <p className="text-sm font-semibold text-[var(--ahh-ink)]">{service.name}</p>
                  {service.category && <p className="mt-1 text-xs text-gray-500">{service.category}</p>}
                </div>
              </div>
              {service.description && <p className="text-sm leading-6 text-[var(--ahh-muted)]">{service.description}</p>}
              {service.patient_fit && <p className="mt-2 text-xs leading-5 text-gray-500">{service.patient_fit}</p>}
            </article>
          ))}
        </div>
      </section>

      {teamMembers.length > 0 && (
        <>
          <hr className="border-gray-100" />
          <section id="team" className="scroll-mt-24 space-y-4">
            <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Meet the Team</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teamMembers.map((member) => (
                <article key={`${member.name}-${member.role || ''}`} className="rounded-lg border border-gray-200 p-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-[var(--ahh-blue)]">
                    {member.name.charAt(0)}
                  </div>
                  <p className="text-sm font-semibold text-[var(--ahh-ink)]">{member.name}</p>
                  {member.role && <p className="mt-1 text-xs text-[var(--ahh-blue)]">{member.role}</p>}
                  {member.bio_snippet && <p className="mt-3 text-xs leading-5 text-[var(--ahh-muted)]">{member.bio_snippet}</p>}
                  {member.languages_spoken && member.languages_spoken.length > 0 && (
                    <p className="mt-3 text-xs text-gray-500">{member.languages_spoken.join(', ')}</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      <hr className="border-gray-100" />

      <section id="pricing" className="scroll-mt-24 space-y-4">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Pricing</h3>
        {pricing.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 px-4">
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

      <hr className="border-gray-100" />

      <section id="location" className="scroll-mt-24 space-y-4">
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Location</h3>
        <div className="rounded-lg bg-[var(--ahh-blue)] p-6 text-white">
          <p className="text-sm font-semibold">{addressString || 'Address unavailable'}</p>
          {location?.parking && <p className="mt-2 text-sm text-blue-50">Parking: {location.parking}</p>}
          {location?.transit && <p className="mt-2 text-sm text-blue-50">Transit: {location.transit}</p>}
          {location?.nearby_landmarks && location.nearby_landmarks.length > 0 && (
            <p className="mt-2 text-sm text-blue-50">Nearby: {location.nearby_landmarks.join(', ')}</p>
          )}
        </div>
      </section>

      <hr className="border-gray-100" />

      <section id="reviews" className="scroll-mt-24 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">Patient Reviews</h3>
            {reviewSummary && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ahh-muted)]">{reviewSummary}</p>}
          </div>
          {displayedRating && (
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-2xl font-bold text-[var(--ahh-ink)]">{displayedRating}</p>
              <StarRow rating={rating} />
              {ratingCount > 0 && <p className="mt-1 text-xs text-gray-500">{ratingCount} reviews</p>}
            </div>
          )}
        </div>
        {reviewThemes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {reviewThemes.map((theme) => (
              <span key={theme} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[var(--ahh-blue)]">
                {theme}
              </span>
            ))}
          </div>
        )}
        {reviews.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {reviews.slice(0, 6).map((review, index) => (
              <ReviewCard key={`${review.author}-${review.date}-${index}`} review={review} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">There are no patient review snippets for this clinic yet.</p>
        )}
      </section>
    </main>
  );
}
