import type { Clinic } from '@/types/database';

interface ClinicMainContentProps {
  clinic: Clinic;
}

const FALLBACK_ABOUT = 
  "We are a community-focused healthcare provider dedicated to delivering comprehensive and compassionate care. Our team is committed to the health and wellness of our patients, offering a wide range of services tailored to meet your unique needs in a welcoming and culturally sensitive environment.";

export function ClinicMainContent({ clinic }: ClinicMainContentProps) {
  const services = clinic.metadata?.services || [
    'Annual Physical Exams',
    'Chronic Disease Management',
    'Preventive Care & Screenings',
    'Vaccinations & Immunizations',
    'Lab Work & Blood Tests',
  ];

  const rating = clinic.metadata?.rating || 0;
  const ratingCount = clinic.metadata?.rating_count || 0;
  const reviews = clinic.metadata?.reviews || [];
  const highlightedReviews = reviews.slice(0, 2);

  return (
    <div className="flex-1 space-y-12">
      
      {/* About Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="brand-heading-2 text-[var(--ahh-ink)]">{clinic.name}</h2>
          <div className="flex gap-2">
            <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </button>
          </div>
        </div>
        <p className="brand-body-copy text-sm">
          {clinic.description || FALLBACK_ABOUT}
        </p>
      </section>

      <hr className="border-gray-100" />

      {/* Service Offer Section */}
      <section>
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)] mb-4 flex items-center gap-2">
          Service Offer: <span className="text-[var(--ahh-ink)]">{clinic.specialty || 'General Care'}</span>
        </h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((service, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-[var(--ahh-muted)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
              {service}
            </li>
          ))}
          {clinic.is_telehealth_available && (
            <li className="flex items-start gap-2 text-sm text-[var(--ahh-muted)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
              Telehealth Appointments
            </li>
          )}
        </ul>
      </section>

      <hr className="border-gray-100" />

      {/* Languages Spoken Section */}
      <section>
        <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)] mb-4">
          Language Spoken:
        </h3>
        <ul className="space-y-2">
          {clinic.languages.length > 0 ? clinic.languages.map((lang, index) => (
            <li key={index} className="flex items-center gap-2 text-sm text-[var(--ahh-muted)]">
              <span className="w-4 h-3 bg-gray-200 rounded-sm inline-block shrink-0" />
              {lang}
            </li>
          )) : (
            <li className="text-sm text-gray-500">English</li>
          )}
          {/* Always show English as a fallback if not listed, to match wireframe style */}
          {!clinic.languages.includes('English') && (
            <li className="flex items-center gap-2 text-sm text-[var(--ahh-muted)]">
              <span className="w-4 h-3 bg-gray-200 rounded-sm inline-block shrink-0" />
              English
            </li>
          )}
        </ul>
      </section>

      <hr className="border-gray-100" />

      {/* Patient Reviews Section */}
      <section>
        <div className="flex items-center gap-4 mb-6">
          <h3 className="text-lg font-bold text-[var(--ahh-deep-teal)]">
            Patient Reviews: {rating > 0 ? rating.toFixed(1) : 'No reviews'}
          </h3>
          {rating > 0 && (
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg key={star} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={star <= Math.round(rating) ? '#F59E0B' : 'none'} stroke="#F59E0B" strokeWidth="1.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ))}
            </div>
          )}
        </div>

        {/* Highlighted Review Card */}
        {highlightedReviews.length > 0 ? (
          <div className="grid gap-4">
            {highlightedReviews.map((review, index) => (
              <div key={`${review.author}-${review.date}-${index}`} className="brand-card flex gap-4 p-6">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-[var(--ahh-blue)] font-bold shrink-0">
                  {review.author?.charAt(0) || 'G'}
                </div>
                <div>
                  <p className="text-sm text-gray-600 italic mb-3">
                    &ldquo;{review.text}&rdquo;
                  </p>
                  <p className="text-xs font-semibold text-gray-900">{review.author}</p>
                  <p className="text-xs text-gray-500 mb-2">
                    Google review{review.date ? ` • ${review.date}` : ''}
                  </p>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg key={star} xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill={star <= Math.round(review.rating) ? '#1F2937' : 'none'} stroke="#1F2937" strokeWidth="1.5">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : ratingCount > 0 ? (
          <p className="text-sm text-gray-500">
            Google rating is available, but detailed review text was not returned for this clinic.
          </p>
        ) : (
          <p className="text-sm text-gray-500">There are no patient reviews for this clinic yet.</p>
        )}
      </section>

    </div>
  );
}
