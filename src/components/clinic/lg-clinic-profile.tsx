import { Fragment } from 'react';
import Link from 'next/link';
import type { Clinic, PricingItem, Review, ServiceOffering } from '@/types/database';
import { TabNav } from '@/components/lg/motion';
import { LgGallery } from '@/components/clinic/lg-gallery';

const EXT_ARROW = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 7l-10 10" />
    <path d="M8 7l9 0l0 9" />
  </svg>
);

const CHEV_RIGHT = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6l-6 6" />
  </svg>
);

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5l10 -10" />
  </svg>
);

const STETHOSCOPE_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 4h-1a2 2 0 0 0 -2 2v3.5a5.5 5.5 0 0 0 11 0v-3.5a2 2 0 0 0 -2 -2h-1" />
    <path d="M8 15a6 6 0 1 0 12 0v-3" />
    <path d="M11 3v2" />
    <path d="M6 3v2" />
    <path d="M18 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
  </svg>
);

const CALENDAR_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21h-6a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v4.5" />
    <path d="M16 3v4" />
    <path d="M8 3v4" />
    <path d="M4 11h16" />
  </svg>
);

const STAR_ICON = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="#F59E0B" aria-hidden="true">
    <path d="M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.794 0l-2.853 5.78z" />
  </svg>
);

const PIN_ICON = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" />
  </svg>
);

const GLOBE_ICON = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
    <path d="M3.6 9h16.8" />
    <path d="M3.6 15h16.8" />
    <path d="M11.5 3a17 17 0 0 0 0 18" />
    <path d="M12.5 3a17 17 0 0 1 0 18" />
  </svg>
);

const PHONE_ICON = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
  </svg>
);

function cleanEditorialText(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/domain-parking|parked domain|could not be verified from the provided source|no verified clinic profile/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const LOCATION_FALLBACK_IMAGES = [
  '/brand/lg/hero.jpg',
  '/brand/lg/primary-care.jpg',
  '/brand/lg/family.jpg',
  '/brand/about/hero-language-care.webp',
  '/brand/about/mission-family-care.webp',
  '/brand/about/step-search-directory.webp',
];

function paragraphs(value?: string | null) {
  return (value || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/** Splits the first sentence so it can be rendered bold like Longevity's prose style. */
function splitLeadSentence(text: string): { lead: string; rest: string } {
  const match = text.match(/^([^.!?]+[.!?])\s+([\s\S]*)$/);
  if (match && match[1].length <= 80) {
    return { lead: match[1], rest: match[2] };
  }
  return { lead: '', rest: text };
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSettingLabel(setting?: string | null) {
  if (!setting) return 'In clinic';
  if (setting === 'at_home') return 'At home';
  if (setting === 'in_lab') return 'In a lab';
  return 'In clinic';
}

function splitNameCredentials(fullName: string): { base: string; creds: string } {
  const cleaned = fullName.replace(/^Dr\.\s+/i, '');
  const idx = cleaned.indexOf(',');
  if (idx > -1) {
    return { base: cleaned.slice(0, idx).trim(), creds: cleaned.slice(idx).trim() };
  }
  return { base: fullName, creds: '' };
}

function Module({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="lg-prof-mod">
      <div className="lg-prof-mod-head">
        <h2 id={`${id}-heading`}>{title}</h2>
      </div>
      <div className="lg-prof-mod-body">{children}</div>
    </section>
  );
}

export function LgClinicProfile({ clinic }: { clinic: Clinic }) {
  const m = clinic.metadata || {};
  const reviewProfile = m.review_profile;
  const rating = reviewProfile?.rating ?? m.rating ?? 0;
  const ratingCount = reviewProfile?.review_count ?? m.rating_count ?? 0;
  const reviews: Review[] = reviewProfile?.featured_reviews?.length ? reviewProfile.featured_reviews : m.reviews || [];
  const themes = reviewProfile?.positive_themes || [];
  const reviewSummary = reviewProfile?.summary || m.review_summary;

  const appointmentUrl = m.appointment?.appointment_url || m.appointment_url;
  const websiteUrl = m.website || m.google_website_url;
  const bookUrl = websiteUrl || appointmentUrl;
  const phoneHref = clinic.phone ? `tel:${clinic.phone.replace(/[^0-9+]/g, '')}` : null;

  const rawImages = [...(m.images || []), ...(m.gallery_images || [])].filter((v, i, a) => v && a.indexOf(v) === i);
  const images = rawImages.length > 0 ? rawImages : ['/brand/lg/hero.jpg', '/brand/lg/primary-care.jpg', '/brand/lg/family.jpg'];

  const cityState = [clinic.city, clinic.state]
    .filter((v): v is string => Boolean(v && !['null', 'none', 'undefined'].includes(v.trim().toLowerCase())))
    .join(', ');
  const about =
    cleanEditorialText(m.about_highlight) ||
    cleanEditorialText(clinic.description) ||
    `${clinic.name} is a trusted ${clinic.specialty?.toLowerCase() || 'primary care'} clinic${cityState ? ` in ${cityState}` : ' in the United States'}.`;
  const lead =
    cleanEditorialText(m.short_description) ||
    paragraphs(about)[0]?.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ') ||
    `${clinic.name} provides culturally informed ${clinic.specialty?.toLowerCase() || 'medical'} care${cityState ? ` in ${cityState}` : ' across the United States'}.`;
  const culturalContext = cleanEditorialText(m.cultural_context) || cleanEditorialText(m.language_note);

  const services: ServiceOffering[] = (m.services_offered?.length ? m.services_offered : m.services || [])
    .map((s) => (typeof s === 'string' ? { name: s } : s))
    .filter((s) => s.name);

  // Group service counts by category for the Longevity pill bar
  const categoryCounts = services.reduce<Record<string, number>>((acc, s) => {
    const key = s.category || s.name;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const pricing: PricingItem[] = m.pricing || [];
  const memberships = m.memberships || [];
  const summary = m.pricing_summary;
  const diagnostics = m.diagnostics || [];
  const team = m.team_members || [];
  const faqs = m.faqs || [];
  const insurance = m.insurance;
  const networks = insurance?.accepted_networks?.length ? insurance.accepted_networks : m.insurance_accepted || [];
  const whatToKnow = m.what_to_know || [];
  const beforeBook = m.before_you_book || [];
  const differentiators = [...(m.differentiators || []), ...(m.highlights || [])];
  const locations = m.locations || [];
  const care = m.care_model;
  const hours = m.working_hours;
  const updated = formatDate(m.profile_updated_at) || '7 May 2026';
  const address = [clinic.address, clinic.city, clinic.state, clinic.zip_code].filter(Boolean).join(', ');
  const mapQuery = m.location?.latitude && m.location?.longitude ? `${m.location.latitude},${m.location.longitude}` : address;

  const hasPricing = pricing.length > 0 || memberships.length > 0 || !!summary;
  const hasKnow = whatToKnow.length + beforeBook.length + differentiators.length > 0 || !!summary;
  const hasCareModel = !!care || (hours && Object.keys(hours).length > 0) || clinic.languages.length > 0;
  const hasDiagnostics = diagnostics.length > 0;
  const hasInsurance = networks.length > 0 || !!insurance;
  const hasLocations = locations.length > 0 || !!address;
  const allLicenses = [
    ...(m.licenses || []),
    ...(m.provider_credentials?.board_certifications || []),
    ...(m.provider_credentials?.hospital_affiliations || []),
  ];
  const hasLicenses = allLicenses.length > 0 || !!m.npi_number;

  const streetShort = clinic.address ? clinic.address.split(',')[0]?.trim() : null;
  const directionsUrl =
    m.google_maps_url ||
    (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${clinic.name} ${address}`)}` : null);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    ...(reviews.length > 0 || ratingCount > 0 || rating > 0 ? [{ id: 'reviews', label: 'Reviews' }] : []),
    ...(hasKnow ? [{ id: 'know', label: 'What to know' }] : []),
    ...(services.length > 0 ? [{ id: 'services', label: 'Services' }] : []),
    ...(hasPricing ? [{ id: 'pricing', label: 'Pricing' }] : []),
    ...(hasPricing || services.length > 0 ? [{ id: 'care-included', label: 'Care included' }] : []),
    ...(hasCareModel ? [{ id: 'care-model', label: 'Care model' }] : []),
    ...(hasDiagnostics ? [{ id: 'diagnostics', label: 'Diagnostics' }] : []),
    ...(hasInsurance ? [{ id: 'insurance', label: 'Insurance' }] : []),
    ...(hasLocations ? [{ id: 'locations', label: 'Locations' }] : []),
    ...(team.length > 0 ? [{ id: 'team', label: 'Team' }] : []),
    ...(faqs.length > 0 ? [{ id: 'faq', label: 'FAQ' }] : []),
    ...(hasLicenses ? [{ id: 'licences', label: 'Licenses' }] : []),
    { id: 'trust', label: 'Trust' },
  ];

  return (
    <div className="lg pb-14">
      {/* ===== Hero Header (Editorial Profile Card + 3-Photo Bento Gallery) ===== */}
      <header className="lg-prof-hero">
        <div className="lg-prof-wrap">
          <div className="lg-prof-topbar">
            <nav aria-label="Breadcrumb" className="lg-prof-crumbs">
              <Link href="/search">Find care</Link>
              <span aria-hidden="true">{CHEV_RIGHT}</span>
              {clinic.specialty && (
                <>
                  <Link href={`/search?specialty=${encodeURIComponent(clinic.specialty)}`}>{clinic.specialty}</Link>
                  <span aria-hidden="true">{CHEV_RIGHT}</span>
                </>
              )}
              <span aria-current="page" className="cur">{clinic.name}</span>
            </nav>

            <span className="lg-prof-updated">
              {CHECK_ICON}
              <span>Verified profile · Updated <time>{updated}</time></span>
            </span>
          </div>

          <div className="lg-prof-hero-card">
            <div className="lg-prof-badges">
              <span className="lg-prof-eyebrow-pill">
                {locations.length > 1 ? 'Organization profile · Clinic network' : `Clinic profile${clinic.specialty ? ` · ${clinic.specialty}` : ''}`}
              </span>
              {m.accepting_new_patients !== false && (
                <span className="lg-prof-status-pill">
                  <i aria-hidden="true" className="dot" />
                  Accepting new patients
                </span>
              )}
              {clinic.is_telehealth_available && (
                <span className="lg-prof-status-pill lg-prof-status-pill--soft">
                  Telehealth available
                </span>
              )}
            </div>

            <h1 className="lg-prof-title">{clinic.name}</h1>

            <div className="lg-prof-facts">
              {(rating > 0 || ratingCount > 0) && (
                <a href="#reviews" className="lg-prof-fact-pill lg-prof-fact-pill--rating">
                  {STAR_ICON}
                  {rating > 0 && <b>{rating.toFixed(1)}</b>}
                  {ratingCount > 0 && <span className="muted">({ratingCount.toLocaleString('en-US')} reviews)</span>}
                </a>
              )}

              {(cityState || locations.length > 0) && (
                <a href="#locations" className="lg-prof-fact-pill">
                  {PIN_ICON}
                  {locations.length > 1 ? (
                    <span>
                      <b>{locations.length}</b> locations
                    </span>
                  ) : (
                    <span>
                      <b>{cityState}</b>
                      {streetShort && <span className="muted"> · {streetShort}</span>}
                    </span>
                  )}
                </a>
              )}

              {clinic.languages.length > 0 && (
                <span className="lg-prof-fact-pill">
                  {GLOBE_ICON}
                  <span>
                    Speaks <b>{clinic.languages.join(', ')}</b>
                  </span>
                </span>
              )}

              {m.founded_year && (
                <span className="lg-prof-fact-pill">
                  <span>
                    Est. <b>{m.founded_year}</b>
                  </span>
                </span>
              )}

              {m.price_tier && (
                <span className="lg-prof-fact-pill">
                  <b>{m.price_tier}</b>
                </span>
              )}
            </div>

            <p className="lg-prof-lead">{lead}</p>

            <div className="lg-prof-actions">
              {bookUrl && (
                <a
                  href={bookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lg-prof-btn lg-prof-btn--primary"
                >
                  <span>{websiteUrl ? 'Visit website' : 'Book a visit'}</span>
                  {EXT_ARROW}
                </a>
              )}
              {phoneHref && (
                <a href={phoneHref} className="lg-prof-btn lg-prof-btn--outline">
                  {PHONE_ICON}
                  <span>Call {clinic.phone}</span>
                </a>
              )}
              {directionsUrl && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lg-prof-btn lg-prof-btn--outline"
                >
                  {PIN_ICON}
                  <span>Get directions</span>
                </a>
              )}
              {!clinic.is_claimed && (
                <Link href={`/claim/${clinic.id}`} className="lg-prof-btn lg-prof-btn--ghost">
                  Claim profile
                </Link>
              )}
            </div>

            {/* 3-Photo Bento Gallery Panel Below Text */}
            <LgGallery images={images} name={clinic.name} />
          </div>
        </div>
      </header>

      {/* ===== Sticky Jump Navigation Bar ===== */}
      <TabNav tabs={tabs} />

      {/* ===== Stacked Profile Modules (Centered 1020px Container) ===== */}
      <div className="lg-prof-wrap" data-profile-modules="true">
        {/* 1. Overview */}
        <Module id="overview" title="Overview">
          <div className="lg-prof-prose">
            {paragraphs(about).map((p, i) => {
              const { lead: firstSentence, rest } = splitLeadSentence(p);
              return (
                <p key={i}>
                  {firstSentence ? (
                    <>
                      <strong>{firstSentence}</strong> {rest}
                    </>
                  ) : (
                    p
                  )}
                </p>
              );
            })}
            {culturalContext && (
              <p>
                <strong>Language and cultural support.</strong> {culturalContext}
              </p>
            )}
          </div>

          {clinic.languages.length > 0 && (
            <div className="lg-chips">
              {clinic.languages.map((lang) => (
                <span key={lang} className="lg-chip">
                  {lang}
                </span>
              ))}
              {clinic.is_telehealth_available && <span className="lg-chip lg-chip--line">Telehealth available</span>}
              {m.accepting_new_patients !== false && <span className="lg-chip lg-chip--line">Accepting new patients</span>}
            </div>
          )}
        </Module>

        {/* 2. Reviews and reputation */}
        {(reviews.length > 0 || ratingCount > 0 || rating > 0) && (
          <Module id="reviews" title="Reviews and reputation">
            <div className="lg-prof-rating-bar">
              {m.google_maps_uri ? (
                <a
                  href={m.google_maps_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="src"
                >
                  <span>{reviewProfile?.source || 'Google'}</span>
                  {EXT_ARROW}
                </a>
              ) : (
                <span className="src">
                  <span>{reviewProfile?.source || 'Google'}</span>
                  {EXT_ARROW}
                </span>
              )}
              {rating > 0 && (
                <span className="score">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="#F59E0B" aria-hidden="true">
                    <path d="M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.794 0l-2.853 5.78z" />
                  </svg>
                  <span>{rating.toFixed(1)}</span>
                </span>
              )}
              {ratingCount > 0 && <span className="cnt">({ratingCount.toLocaleString('en-US')} reviews)</span>}
              <span className="chk">Checked {updated}</span>
            </div>

            {reviewSummary && <p className="lg-prof-text">{reviewSummary}</p>}

            {themes.length > 0 && (
              <div className="lg-chips">
                {themes.map((t) => (
                  <span key={t} className="lg-chip">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {reviews.length > 0 && (
              <div className="lg-prof-reviews-grid">
                {reviews.slice(0, 4).map((r, i) => (
                  <article key={`${r.author}-${i}`} className="lg-prof-rcard">
                    <div className="top">
                      <b>{r.author || 'Verified Patient'}</b>
                      <span className="stars">★ {(r.rating || 5).toFixed(1)}</span>
                    </div>
                    {r.text && <p>“{r.text}”</p>}
                    {r.date && <footer>{formatDate(r.date)}</footer>}
                  </article>
                ))}
              </div>
            )}
          </Module>
        )}

        {/* 3. What to know */}
        {hasKnow && (
          <Module id="know" title="What to know">
            {whatToKnow.length > 0 && (
              <div className="lg-prof-subblock">
                <h3>Signature approach</h3>
                <div className="lg-prof-prose">
                  {whatToKnow.map((h) => (
                    <p key={h.title}>
                      <strong>{h.title}.</strong> {h.detail}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {differentiators.length > 0 && (
              <div className="lg-prof-subblock">
                <h3>What sets them apart</h3>
                <ul className="lg-prof-bullets">
                  {differentiators.map((h) => (
                    <li key={h.title}>
                      <span aria-hidden="true" className="b-dot">•</span>
                      <span>
                        <strong>{h.title.replace(/\.$/, '')}.</strong> {h.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {beforeBook.length > 0 && (
              <div className="lg-prof-subblock">
                <h3>Before You Book</h3>
                <ul className="lg-prof-bullets">
                  {beforeBook.map((h) => (
                    <li key={h.title}>
                      <span aria-hidden="true" className="b-dot">•</span>
                      <span>
                        <strong>{h.title.replace(/\.$/, '')}.</strong> {h.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary && (summary.starting_price || summary.typical_annual_range) && (
              <div className="lg-prof-subblock">
                <h3>Pricing at a glance</h3>
                <p className="lg-prof-text">
                  {summary.starting_price && (
                    <>
                      From <b>{summary.starting_price}{summary.starting_unit ? `/${summary.starting_unit}` : ''}</b>
                      {summary.typical_annual_range ? '; ' : '. '}
                    </>
                  )}
                  {summary.typical_annual_range && (
                    <>
                      typical annual <b>{summary.typical_annual_range}</b>.{' '}
                    </>
                  )}
                  <a href="#pricing" className="lg-prof-inline-link">
                    Full pricing
                  </a>
                </p>
              </div>
            )}
          </Module>
        )}

        {/* 4. Services and treatments */}
        {services.length > 0 && (
          <Module id="services" title="Services and treatments">
            <ul className="lg-prof-svc-tags">
              {Object.entries(categoryCounts).map(([cat, count]) => (
                <li key={cat}>
                  <span className="name">{cat}</span>
                  <span className="cnt">({count})</span>
                </li>
              ))}
              {services
                .filter((s) => !categoryCounts[s.name])
                .map((s) => (
                  <li key={s.name}>
                    <span className="name">{s.name}</span>
                  </li>
                ))}
            </ul>

            <details className="lg-prof-disclosure">
              <summary>
                <span>View full service catalog ({services.length})</span>
                <span className="plus" aria-hidden="true">+</span>
              </summary>
              <div className="lg-prof-disclosure-body">
                <ul className="lg-prof-list">
                  {services.map((s) => (
                    <li key={s.name}>
                      <div className="row">
                        <div className="ttl">{s.name}</div>
                        {s.category && <div className="val">{s.category}</div>}
                      </div>
                      {s.description && <p className="desc">{s.description}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </Module>
        )}

        {/* 5. Pricing and payment */}
        {hasPricing && (
          <Module id="pricing" title="Pricing and payment">
            {summary && (summary.starting_price || summary.typical_annual_range) && (
              <ul className="lg-prof-list">
                {summary.starting_price && (
                  <li>
                    <div className="row">
                      <div className="ttl">Starting at</div>
                      <div className="val">
                        {summary.starting_price}
                        {summary.starting_unit ? `/${summary.starting_unit}` : ''}
                      </div>
                    </div>
                    {memberships[0] && (
                      <p className="desc">
                        {memberships[0].name} ({memberships[0].description || 'recurring testing + consultations'})
                      </p>
                    )}
                  </li>
                )}
                {summary.typical_annual_range && (
                  <li>
                    <div className="row">
                      <div className="ttl">Typical annual investment</div>
                      <div className="val">{summary.typical_annual_range}</div>
                    </div>
                    <p className="desc">
                      Active patients often combine baseline assessments with ongoing consultations or targeted therapy
                      programs over the course of a year.
                    </p>
                  </li>
                )}
              </ul>
            )}

            {pricing.length > 0 && (
              <div className="lg-prof-subblock">
                <h3 className="caps">Assessments &amp; Services</h3>
                <ul className="lg-prof-list">
                  {pricing.map((p, i) => {
                    const pName = p.name || (p as { service_name?: string }).service_name || `Service ${i + 1}`;
                    const pNote = p.notes || (p as { note?: string }).note || p.category;
                    return (
                      <li key={pName + i}>
                        <div className="row">
                          <div className="ttl">{pName}</div>
                          <div className="val">{p.price || p.price_range || 'Contact clinic'} · one-time</div>
                        </div>
                        {pNote && <p className="desc">{pNote}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {memberships.length > 0 && (
              <div className="lg-prof-subblock">
                <h3 className="caps">Memberships</h3>
                <ul className="lg-prof-list">
                  {memberships.map((t) => (
                    <Fragment key={t.name}>
                      <li>
                        <div className="row">
                          <div className="ttl">{t.name}</div>
                          <div className="val">
                            {t.price} {t.period ? `· ${t.period}` : ''}
                          </div>
                        </div>
                        <p className="desc">
                          {[t.description, ...(t.benefits || []), t.cancel_anytime ? 'cancel anytime' : '']
                            .filter(Boolean)
                            .join('; ')}
                        </p>
                      </li>
                      {t.yearly_price && (
                        <li>
                          <div className="row">
                            <div className="ttl">{t.name} (billed yearly)</div>
                            <div className="val">{t.yearly_price} · per year</div>
                          </div>
                          <p className="desc">Annual plan includes priority scheduling and comprehensive lab review.</p>
                        </li>
                      )}
                    </Fragment>
                  ))}
                </ul>
              </div>
            )}

            {summary && (summary.payment_methods || summary.accepts_hsa_fsa) && (
              <div className="lg-prof-paynote">
                <p className="head">
                  Self-pay {summary.accepts_hsa_fsa ? '· HSA/FSA funds accepted' : ''}
                </p>
                {summary.payment_methods && <p className="body">{summary.payment_methods}</p>}
                {summary.checked_at && <p className="chk">Prices checked {formatDate(summary.checked_at)}</p>}
              </div>
            )}
          </Module>
        )}

        {/* 6. Care included */}
        {(hasPricing || services.length > 0) && (
          <Module id="care-included" title="Care included">
            <div className="lg-prof-subblock">
              <h3>{pricing[0]?.name || services[0]?.name || 'Comprehensive Assessment & Consultation'}</h3>
              <ul className="lg-prof-inline-checks">
                <li>
                  {CHECK_ICON}
                  <span>A clinician orders your tests</span>
                </li>
                <li>
                  {CHECK_ICON}
                  <span>Results reviewed by a clinician</span>
                </li>
                <li>
                  {CHECK_ICON}
                  <span>Bilingual consultation available</span>
                </li>
                <li>
                  {CHECK_ICON}
                  <span>Personalized action plan</span>
                </li>
              </ul>
              <p className="lg-prof-text">
                A physician or practitioner interprets results during a dedicated consultation and delivers a clear
                wellness and follow-up plan in the language your family trusts.
              </p>
            </div>
          </Module>
        )}

        {/* 7. Care model */}
        {hasCareModel && (
          <Module id="care-model" title="Care model">
            <dl className="lg-prof-dl">
              {care?.engagement?.length ? (
                <div>
                  <dt>Engagement</dt>
                  <dd>{care.engagement.join(', ')}</dd>
                </div>
              ) : null}
              {care?.free_consultation !== undefined && care?.free_consultation !== null ? (
                <div>
                  <dt>Complimentary consultation</dt>
                  <dd>{care.free_consultation ? 'Yes' : 'No'}</dd>
                </div>
              ) : null}
              <div>
                <dt>Telehealth</dt>
                <dd>{care?.telehealth ?? clinic.is_telehealth_available ? 'Yes' : 'In-person only'}</dd>
              </div>
              <div>
                <dt>Language &amp; interpreter</dt>
                <dd>{clinic.languages.length > 0 ? clinic.languages.join(', ') : 'Available upon request'}</dd>
              </div>
              {care?.mobile_app !== undefined && care?.mobile_app !== null ? (
                <div>
                  <dt>Patient portal / app</dt>
                  <dd>{care.mobile_app ? 'Yes' : 'No'}</dd>
                </div>
              ) : null}
              {care?.provider_count ? (
                <div>
                  <dt>Providers</dt>
                  <dd>{care.provider_count}</dd>
                </div>
              ) : null}
              {hours && Object.keys(hours).length > 0 && (
                <div className="lg-prof-dl-wide">
                  <dt>Hours</dt>
                  <dd>
                    <div className="lg-prof-hours-grid">
                      {DAYS.filter((d) => hours[d]).map((d) => {
                        const val = hours[d] || '';
                        const isClosed = /closed/i.test(val);
                        return (
                          <div key={d} className={`lg-prof-hour-item ${isClosed ? 'is-closed' : ''}`}>
                            <span className="day">{d.slice(0, 3).toUpperCase()}</span>
                            <span className="time">{val}</span>
                          </div>
                        );
                      })}
                    </div>
                  </dd>
                </div>
              )}
            </dl>
          </Module>
        )}

        {/* 8. Diagnostics and testing */}
        {hasDiagnostics && (
          <Module id="diagnostics" title="Diagnostics and testing">
            <ul className="lg-prof-list">
              {diagnostics.map((d) => (
                <li key={d.name}>
                  <div className="row">
                    <div className="ttl underline decoration-[#024E44]/50 underline-offset-4">{d.name}</div>
                    {d.price_from && <div className="val">From {d.price_from}</div>}
                  </div>
                  <div className="badges">
                    <span className="pill">{formatSettingLabel(d.setting)}</span>
                    {d.detail && <span>{d.detail}</span>}
                  </div>
                  {d.description && <p className="desc">{d.description}</p>}
                </li>
              ))}
            </ul>
          </Module>
        )}

        {/* 9. Insurance */}
        {hasInsurance && (
          <Module id="insurance" title="Insurance and coverage">
            {networks.length > 0 && (
              <div className="lg-chips">
                {networks.map((n) => (
                  <span key={n} className="lg-chip lg-chip--line">
                    {n}
                  </span>
                ))}
              </div>
            )}
            {(insurance?.accepts_medicare ||
              insurance?.accepts_medicaid ||
              insurance?.accepts_private_insurance) && (
              <div className="lg-chips">
                {insurance?.accepts_medicare && <span className="lg-chip">Medicare accepted</span>}
                {insurance?.accepts_medicaid && <span className="lg-chip">Medicaid accepted</span>}
                {insurance?.accepts_private_insurance && <span className="lg-chip">Private PPO / HMO</span>}
              </div>
            )}
            {insurance?.notes && !/parked domain/i.test(insurance.notes) && (
              <p className="lg-prof-text">{insurance.notes}</p>
            )}
          </Module>
        )}

        {/* 10. Locations */}
        {hasLocations && (
          <Module id="locations" title="Locations">
            {locations.length > 0 ? (
              <>
                <p className="lg-prof-text">
                  {locations.filter((l) => l.status !== 'opening_soon').length} open locations
                  {m.opening_locations?.length ? `. Opening soon: ${m.opening_locations.join('; ')}.` : '.'}
                </p>
                <div className="lg-prof-locs-grid">
                  {locations.map((loc, i) => {
                    const soon = loc.status === 'opening_soon';
                    const imgSrc = LOCATION_FALLBACK_IMAGES[i % LOCATION_FALLBACK_IMAGES.length];
                    return (
                      <article key={loc.name} className="lg-prof-lcard">
                        <div className="media">
                          {soon ? (
                            <div className="placeholder">
                              <span>{loc.city || loc.name}</span>
                            </div>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imgSrc} alt={`${clinic.name} in ${loc.name}`} loading="lazy" />
                          )}
                        </div>
                        <div className="bd">
                          <h3>{loc.name}</h3>
                          {loc.description && <p className="desc">{loc.description}</p>}
                          {loc.highlights && loc.highlights.length > 0 && (
                            <div className="tags">
                              {loc.highlights.map((h) => (
                                <span key={h}>{h}</span>
                              ))}
                            </div>
                          )}
                          <div className="foot">
                            <p className="addr">{[loc.address, loc.city, loc.state].filter(Boolean).join(', ')}</p>
                            <p className={`stat ${soon ? 'soon' : ''}`}>
                              {soon ? 'Opening soon' : 'Open · Walk Ins Welcome'}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="lg-prof-map-card">
                <p className="addr">{address}</p>
                {mapQuery && (
                  <iframe
                    title={`${clinic.name} map`}
                    loading="lazy"
                    src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
                    style={{ width: '100%', height: 300, border: 0, borderRadius: 14, marginTop: 12 }}
                  />
                )}
              </div>
            )}
          </Module>
        )}

        {/* 11. Team and clinical leadership */}
        {team.length > 0 && (
          <Module id="team" title="Team and clinical leadership">
            <div className="lg-prof-team-grid">
              {team.map((member) => {
                const { base, creds } = splitNameCredentials(member.name);
                const initials = base
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
                return (
                  <article key={member.name} className="lg-prof-pcard">
                    <div className="portrait">
                      {member.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.image_url} alt={member.name} loading="lazy" />
                      ) : (
                        <div className="initials">{initials}</div>
                      )}
                      <div aria-hidden="true" className="frame" />
                    </div>
                    <div className="info">
                      <div>
                        <h3>
                          {base}
                          {creds && <span className="creds">{creds}</span>}
                        </h3>
                        {member.role && <p className="role">{member.role}</p>}
                        {member.bio_snippet && <p className="bio">{member.bio_snippet}</p>}
                      </div>
                      <ul className="meta">
                        <li>
                          {STETHOSCOPE_ICON}
                          Clinical
                        </li>
                        <li>
                          {CALENDAR_ICON}
                          In person &amp; telehealth
                        </li>
                      </ul>
                      {member.languages_spoken && member.languages_spoken.length > 0 && (
                        <div className="tags">
                          {member.languages_spoken.map((lang) => (
                            <span key={lang}>{lang}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </Module>
        )}

        {/* 12. Frequently asked questions */}
        {faqs.length > 0 && (
          <Module id="faq" title="Frequently asked questions">
            <div className="lg-prof-faqs">
              {faqs.map((f) => (
                <details key={f.question} className="lg-prof-disclosure">
                  <summary>
                    <span>{f.question}</span>
                    <span className="plus" aria-hidden="true">+</span>
                  </summary>
                  <div className="lg-prof-disclosure-body">
                    <p className="lg-prof-text">{f.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </Module>
        )}

        {/* 13. Licenses, certifications and memberships */}
        {hasLicenses && (
          <Module id="licences" title="Licenses, certifications and memberships">
            <ul className="lg-prof-lic-list">
              {allLicenses.map((lic) => (
                <li key={lic}>
                  <p className="title">{lic}</p>
                  <p className="sub">Verified clinical credential or medical board affiliation.</p>
                </li>
              ))}
              {m.npi_number && (
                <li>
                  <p className="title">
                    National Provider Identifier (NPI) <span>· #{m.npi_number}</span>
                  </p>
                  <p className="sub">Registered healthcare organization / provider identifier in the United States.</p>
                </li>
              )}
            </ul>
          </Module>
        )}

        {/* 14. Trust */}
        <Module id="trust" title="Trust">
          <p className="lg-prof-text" style={{ fontSize: 14 }}>
            Profile updated <time>{updated}</time>
          </p>
          <div className="lg-prof-trust-links">
            <Link href="/about">
              {CHEV_RIGHT}
              <span>How we evaluate clinics</span>
            </Link>
            {!clinic.is_claimed && (
              <Link href={`/claim/${clinic.id}`}>
                {CHEV_RIGHT}
                <span>Claim or update this clinic profile</span>
              </Link>
            )}
          </div>
          <div className="lg-prof-disclaimer">
            <p>
              Directory listings are for informational purposes only. Inclusion does not constitute medical endorsement.
              Verify language support, insurance coverage, and provider credentials directly with the clinic before
              booking.
            </p>
          </div>
        </Module>

        {/* 15. Keep exploring */}
        <Module id="keep-exploring" title="Keep exploring">
          <ul className="lg-prof-explore">
            <li>
              <Link href="/search">
                <span>Find care</span>
                {CHEV_RIGHT}
              </Link>
            </li>
            {clinic.specialty && (
              <li>
                <Link href={`/search?specialty=${encodeURIComponent(clinic.specialty)}`}>
                  <span>More {clinic.specialty} clinics</span>
                  {CHEV_RIGHT}
                </Link>
              </li>
            )}
            {clinic.city && (
              <li>
                <Link href={`/search?city=${encodeURIComponent(clinic.city)}`}>
                  <span>Clinics in {clinic.city}</span>
                  {CHEV_RIGHT}
                </Link>
              </li>
            )}
            {clinic.languages.map((lang) => (
              <li key={lang}>
                <Link href={`/search?language=${encodeURIComponent(lang)}`}>
                  <span>{lang}-speaking clinics</span>
                  {CHEV_RIGHT}
                </Link>
              </li>
            ))}
          </ul>
        </Module>
      </div>
    </div>
  );
}
