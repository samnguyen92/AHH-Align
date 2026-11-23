'use client';

// Clinic profile page ("Mosaic"):
// 1. Identity + actions
// 2. Interactive Photo Gallery (1 large hero image + thumbnail strip below + fullscreen Lightbox) + At a Glance card
// 3. Complete Sticky Section Nav Bar (About, What to know, Services, Pricing, Insurance, Team, Location & Hours, Reviews, FAQ, Trust)
// 4. Similar clinics
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Expand,
  Globe,
  MapPin,
  Minus,
  Navigation,
  Phone,
  ShieldCheck,
  Star,
  Video,
  X,
} from 'lucide-react';
import type { ClinicPageData } from './types';
import type { HighlightItem, PricingItem, ServiceOffering, WorkingHours } from '@/types/database';
import { SiteImg } from './img';
import { Roll } from './ui';
import { INK, DIRECTORY, card, focusRing, clinicHref } from './kit';
import { useLocale } from '@/lib/i18n/context';
import {
  DAY_LABELS,
  getLocalizedClinicData,
  translateLanguage,
  translateSpecialty,
} from '@/lib/i18n';
import { getStateName, normalizeStateCode } from '@/lib/states';

const DAYS: (keyof WorkingHours)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// how each directory language is written by its own speakers
const NATIVE: Record<string, { text: string; lang: string }> = {
  Vietnamese: { text: 'Tiếng Việt', lang: 'vi' },
  Korean: { text: '한국어', lang: 'ko' },
  Chinese: { text: '中文', lang: 'zh' },
};

const wrap = 'mx-auto w-full max-w-[90rem] px-3 md:px-5';

function clean(v?: string | null) {
  const t = v?.trim();
  if (!t || /domain-parking|parked domain|could not be verified|no verified clinic profile/i.test(t)) return null;
  return t;
}

function Stars({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <span className="flex gap-0.5 text-[#024E44]" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} className={size} fill={value >= i + 0.75 ? 'currentColor' : 'none'} strokeWidth={1.6} />
      ))}
    </span>
  );
}

/** today's weekday, read after mount so server and client render the same markup */
function useToday() {
  const [day, setDay] = useState<keyof WorkingHours | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDay(DAYS[(new Date().getDay() + 6) % 7]));
    return () => cancelAnimationFrame(id);
  }, []);
  return day;
}

/** one reading-column section: a plain heading, then the content */
function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-32 border-t border-[#0D1F1C]/10 py-10 first:border-t-0 first:pt-0 md:py-14">
      <h2 id={`${id}-h`} className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
      <div className="mt-5 md:mt-6">{children}</div>
    </section>
  );
}

/** a small labelled fact row in the sidebar */
function Fact({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-4">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 opacity-60" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-55">{label}</p>
        <div className="mt-1.5 text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

export function ClinicPage({ data }: { data: ClinicPageData }) {
  const { clinic: c, photo, photos, photoFallback, langs, similar } = data;
  const { locale, t } = useLocale();
  const m = c.metadata ?? {};
  const loc = getLocalizedClinicData(m, locale);
  const today = useToday();

  // Gallery state: 1 large hero image + thumbnail strip below + fullscreen Lightbox
  const galleryPhotos = photos && photos.length > 0 ? photos : photo ? [photo] : [photoFallback];
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const safeIdx = activeIdx < galleryPhotos.length ? activeIdx : 0;
  const currentPhoto = galleryPhotos[safeIdx] ?? photoFallback;

  useEffect(() => {
    if (!lightboxOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight') setActiveIdx((i) => (i + 1) % galleryPhotos.length);
      if (e.key === 'ArrowLeft') setActiveIdx((i) => (i - 1 + galleryPhotos.length) % galleryPhotos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [lightboxOpen, galleryPhotos.length]);

  const rating = typeof m.rating === 'number' ? m.rating : null;
  const ratingCount = m.rating_count ?? 0;
  const stateCode = normalizeStateCode(c.state);
  const place = [c.city, c.state].filter(Boolean).join(', ');
  const street = c.address?.split(',')[0]?.trim();
  const address = [street, c.city, [c.state, c.zip_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  const about =
    clean(loc.about_highlight) ||
    clean(loc.description) ||
    clean(loc.short_description) ||
    clean(m.about_highlight) ||
    clean(c.description) ||
    clean(m.short_description);

  const languageNote =
    clean(loc.language_note) ||
    clean(loc.cultural_context) ||
    clean(m.language_note) ||
    clean(m.cultural_context);

  const website = m.website || m.google_website_url || m.appointment?.appointment_url || m.appointment_url;
  const phone = c.phone?.trim();
  const phoneHref = phone && /\d/.test(phone) ? `tel:${phone.replace(/[^0-9+]/g, '')}` : null;
  const directions =
    m.google_maps_uri ||
    m.google_maps_url ||
    (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name} ${address}`)}` : null);
  const hours = m.working_hours && Object.keys(m.working_hours).length ? m.working_hours : null;

  // What to know / Differentiators / Before you book
  const whatToKnow: HighlightItem[] = (loc.what_to_know?.length ? loc.what_to_know : m.what_to_know ?? []).filter((x) => x?.title || x?.detail);
  const differentiators: HighlightItem[] = (
    loc.differentiators?.length ? loc.differentiators : [...(m.differentiators ?? []), ...(m.highlights ?? [])]
  )
    .map((x) => (typeof x === 'string' ? { title: x, detail: '' } : x))
    .filter((x) => x?.title || x?.detail);
  const beforeYouBook: HighlightItem[] = (loc.before_you_book?.length ? loc.before_you_book : m.before_you_book ?? []).filter(
    (x) => x?.title || x?.detail,
  );
  const hasKnow = whatToKnow.length > 0 || differentiators.length > 0 || beforeYouBook.length > 0;

  // Services + Category Filter
  const rawServices = loc.services_offered?.length ? loc.services_offered : m.services_offered?.length ? m.services_offered : m.services ?? [];
  const services: ServiceOffering[] = rawServices
    .map((s) => (typeof s === 'string' ? { name: s } : s))
    .filter((s) => s.name)
    .slice(0, 16);
  const serviceCategories = Array.from(new Set(services.map((s) => s.category).filter((v): v is string => Boolean(v))));
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const visibleServices =
    selectedCategory === 'ALL' ? services : services.filter((s) => s.category === selectedCategory);

  // Pricing (strictly hidden if no public pricing)
  const pricing: PricingItem[] = (m.pricing ?? []).filter((p) => p?.name && (p?.price || p?.price_range));
  const pricingSummary = m.pricing_summary;
  const memberships = m.memberships ?? [];
  const hasPricing = pricing.length > 0 || memberships.length > 0 || Boolean(pricingSummary?.starting_price);

  // Insurance
  const insurance = m.insurance;
  const networks = (insurance?.accepted_networks?.length ? insurance.accepted_networks : m.insurance_accepted ?? []).filter(Boolean);
  const insuranceRows: [string, boolean | null | undefined][] = [
    [t.clinic.medicare, insurance?.accepts_medicare ?? networks.some((n) => /medicare/i.test(n))],
    [t.clinic.medicaid, insurance?.accepts_medicaid ?? networks.some((n) => /medicaid|medi-cal/i.test(n))],
    [t.clinic.privateInsurance, insurance?.accepts_private_insurance ?? networks.length > 0],
  ];
  const hasInsurance = networks.length > 0 || Boolean(insurance);

  // Reviews, Team, FAQs, Location, Trust
  const reviews = (m.reviews ?? []).filter((r) => r.text?.trim()).slice(0, 6);
  const reviewSummary = clean(loc.review_summary) || clean(m.review_summary) || clean(m.review_profile?.summary);
  const team = (m.team_members ?? []).filter((tm) => tm?.name).slice(0, 8);
  const faqs = (loc.faqs?.length ? loc.faqs : m.faqs ?? []).filter((f) => f?.question && f?.answer).slice(0, 8);
  const speaksEnglish = c.languages.some((l) => l.toLowerCase() === 'english');
  const todayHours = today && hours ? hours[today] || t.clinic.closed : null;
  const hasLocation = Boolean(address || hours || m.location?.parking || m.location?.transit);
  const allCredentials = [
    ...(m.licenses ?? []),
    ...(m.provider_credentials?.board_certifications ?? []),
    ...(m.provider_credentials?.hospital_affiliations ?? []),
    ...(m.provider_credentials?.professional_memberships ?? []),
    ...(m.npi_number ? [`NPI #${m.npi_number}`] : []),
  ].filter(Boolean);

  // Expanded Section Navigation Bar (matches previous version's rich section navigation)
  const nav: [string, string][] = [
    about && ['about', t.clinic.navAbout],
    hasKnow && ['know', t.clinic.navWhatToKnow],
    services.length > 0 && ['services', t.clinic.navServices],
    hasPricing && ['pricing', t.clinic.navPricing],
    hasInsurance && ['insurance', t.clinic.navInsurance],
    team.length > 0 && ['team', t.clinic.navTeam],
    hasLocation && ['location', t.clinic.navLocation],
    (reviews.length > 0 || reviewSummary) && ['reviews', t.clinic.navReviews],
    faqs.length > 0 && ['faq', t.clinic.navFaq],
    ['trust', t.clinic.navTrust],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="site-a bg-white" style={{ fontFamily: "'Be Vietnam Pro', sans-serif", color: INK }}>
      <div className="pt-20 pb-10 md:pt-[5.375rem] md:pb-16">
        {/* ================= 1. Identity + actions ================= */}
        <header className={`${wrap} pb-6 pt-4 md:pb-8 md:pt-8`}>
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-semibold opacity-60">
            <Link href={DIRECTORY} className="hover:underline">{t.clinic.directoryCrumb}</Link>
            {c.specialty && (
              <>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <Link href={`${DIRECTORY}?specialty=${encodeURIComponent(c.specialty)}`} className="hover:underline">
                  {translateSpecialty(c.specialty, locale)}
                </Link>
              </>
            )}
            {stateCode && (
              <>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <Link href={`${DIRECTORY}?state=${encodeURIComponent(stateCode)}`} className="hover:underline">
                  {getStateName(stateCode, locale)} ({stateCode})
                </Link>
              </>
            )}
          </nav>

          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="max-w-[22ch] text-[clamp(2.25rem,5vw,4.5rem)] font-bold leading-[0.95] tracking-tight">{c.name}</h1>
              <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold md:text-base">
                {rating && (
                  <a href="#reviews" className="inline-flex items-center gap-2 hover:underline">
                    <Stars value={rating} />
                    <span>{rating.toFixed(1)}</span>
                    <span className="opacity-60">({ratingCount.toLocaleString('en-US')} {t.clinic.reviewsWord})</span>
                  </a>
                )}
                {c.specialty && <span className="opacity-70">{translateSpecialty(c.specialty, locale)}</span>}
                <span className="inline-flex items-center gap-1.5 opacity-70">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {place}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {phoneHref && (
                <a href={phoneHref} className={`inline-flex min-h-14 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#024E44] px-6 text-sm font-bold text-white btn-fx md:min-h-12 md:w-auto ${focusRing}`}>
                  <Phone className="h-4 w-4" aria-hidden="true" /> <Roll>{`${t.clinic.callPrefix} ${phone}`}</Roll>
                </a>
              )}
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-12 items-center gap-2 rounded-full border border-[#0D1F1C]/25 px-6 text-sm font-bold btn-fx btn-fx--green ${focusRing}`}>
                  <Globe className="h-4 w-4" aria-hidden="true" /> <Roll>{t.clinic.website}</Roll>
                </a>
              )}
            </div>
          </div>
        </header>

        {/* ================= 2. Photo Gallery (1 Large Image + Thumbnail Strip below + Lightbox) + At a Glance ================= */}
        <div className={`${wrap} grid gap-2 md:grid-cols-3 md:gap-3`}>
          <div className="flex flex-col gap-2 md:col-span-2">
            <div className={`${card} group aspect-[4/3] w-full bg-stone-100 md:aspect-auto md:min-h-[28rem] md:flex-1`}>
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label={t.clinic.viewAllPhotos}
                className="relative block h-full w-full cursor-zoom-in text-left"
              >
                <SiteImg
                  key={currentPhoto}
                  src={currentPhoto}
                  fallback={photoFallback}
                  alt={`${c.name} — ${safeIdx + 1}`}
                  eager
                  className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
                />
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-black/65 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md transition group-hover:bg-black/80">
                  <Expand className="h-3.5 w-3.5" aria-hidden="true" />
                  {galleryPhotos.length > 1
                    ? `${safeIdx + 1} / ${galleryPhotos.length} ${t.clinic.photosCount}`
                    : t.clinic.viewAllPhotos}
                </span>
              </button>
              {galleryPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => setActiveIdx((i) => (i - 1 + galleryPhotos.length) % galleryPhotos.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/85 text-[#0D1F1C] shadow-md backdrop-blur-md transition hover:bg-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => setActiveIdx((i) => (i + 1) % galleryPhotos.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/85 text-[#0D1F1C] shadow-md backdrop-blur-md transition hover:bg-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail strip below main image */}
            {galleryPhotos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Clinic photos">
                {galleryPhotos.map((src, idx) => {
                  const selected = idx === safeIdx;
                  return (
                    <button
                      key={`${src}-${idx}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveIdx(idx)}
                      className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg transition md:h-20 md:w-28 md:rounded-xl ${
                        selected
                          ? 'ring-2 ring-[#024E44] ring-offset-2 opacity-100'
                          : 'opacity-65 hover:opacity-100'
                      }`}
                    >
                      <SiteImg src={src} fallback={photoFallback} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* the four facts a family checks before calling, in the order they check them */}
          <div className="flex flex-col rounded-xl bg-[#E3F1EC] p-5 md:rounded-2xl md:p-7">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-60">{t.clinic.atAGlance}</p>
            <dl className="mt-4 flex flex-1 flex-col divide-y divide-[#0D1F1C]/10">
              <div className="pb-4">
                <dt className="text-xs font-semibold opacity-60">{t.clinic.staffSpeak}</dt>
                <dd className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {langs.map((l) => (
                    <span key={l} lang={NATIVE[l]?.lang} className="text-2xl font-bold leading-none md:text-3xl">
                      {NATIVE[l]?.text ?? translateLanguage(l, locale)}
                    </span>
                  ))}
                  {speaksEnglish && <span className="text-sm font-semibold opacity-60">{t.clinic.andEnglish}</span>}
                </dd>
                {c.languages.filter((l) => !['English', 'Vietnamese', 'Korean', 'Chinese'].includes(l)).length > 0 && (
                  <p className="mt-1.5 text-xs font-semibold opacity-75">
                    {c.languages
                      .filter((l) => l !== 'English')
                      .map((l) => translateLanguage(l, locale))
                      .join(' · ')}
                  </p>
                )}
              </div>
              <div className="py-4">
                <dt className="text-xs font-semibold opacity-60">{t.clinic.newPatients}</dt>
                <dd className="mt-1 text-base font-bold">
                  {m.accepting_new_patients
                    ? t.clinic.acceptingNew
                    : m.accepting_new_patients === false
                      ? t.clinic.notAcceptingNew
                      : t.clinic.askTheClinic}
                </dd>
              </div>
              <div className="py-4">
                <dt className="text-xs font-semibold opacity-60">{t.clinic.today}</dt>
                <dd className="mt-1 text-base font-bold">{todayHours ?? (hours ? '—' : t.clinic.callForHours)}</dd>
              </div>
              <div className="pt-4">
                <dt className="text-xs font-semibold opacity-60">{t.clinic.visit}</dt>
                <dd className="mt-1 text-base font-bold">
                  {c.is_telehealth_available ? (
                    <span className="inline-flex items-center gap-2">
                      <Video className="h-4 w-4" aria-hidden="true" />
                      {t.clinic.inPersonOrVideo}
                    </span>
                  ) : (
                    t.clinic.inPerson
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* ================= 3. Sticky Section Navigation Bar + Reading Column + Practical Facts ================= */}
        {nav.length > 1 && (
          <div className={`${wrap} sticky top-20 z-30 mt-8 md:top-24 md:mt-12`}>
            <nav
              aria-label="On this page"
              className="flex gap-1 overflow-x-auto rounded-full bg-stone-100/95 p-1.5 shadow-sm ring-1 ring-[#0D1F1C]/10 backdrop-blur-md [scrollbar-width:none] md:inline-flex"
            >
              {nav.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors hover:bg-white ${focusRing}`}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        )}

        <div className={`${wrap} mt-8 grid gap-10 md:mt-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16`}>
          <div className="min-w-0">
            {/* 3.1 ABOUT + LANGUAGE SUPPORT */}
            {about && (
              <Block id="about" title={t.clinic.navAbout}>
                <div className="max-w-[65ch] space-y-4 text-base leading-relaxed opacity-85 md:text-lg">
                  {about.split(/\n\s*\n/).map((para, i) => (
                    <p key={i}>{para.trim()}</p>
                  ))}
                </div>
                {languageNote && (
                  <div className="mt-6 max-w-[65ch] rounded-xl bg-[#FBF4EC] p-5 text-sm leading-relaxed md:rounded-2xl md:p-6 md:text-base">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[#B5521F]">
                      {t.clinic.languageSupport}
                    </span>
                    <p className="text-[#0D1F1C]/90">{languageNote}</p>
                  </div>
                )}
              </Block>
            )}

            {/* 3.2 WHAT TO KNOW / DIFFERENTIATORS / BEFORE YOU BOOK */}
            {hasKnow && (
              <Block id="know" title={t.clinic.whatToKnowTitle}>
                <div className="space-y-8">
                  {whatToKnow.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {whatToKnow.map((item, i) => (
                        <div key={`wtk-${i}`} className="rounded-xl bg-stone-50 p-5 md:rounded-2xl">
                          <p className="font-bold">{item.title}</p>
                          {item.detail && <p className="mt-1.5 text-sm leading-relaxed opacity-80">{item.detail}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {differentiators.length > 0 && (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest opacity-60">
                        {t.clinic.differentiatorsTitle}
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {differentiators.map((item, i) => (
                          <div key={`diff-${i}`} className="flex gap-3 rounded-xl bg-[#E3F1EC]/65 p-4 md:rounded-2xl">
                            <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#024E44]" aria-hidden="true" />
                            <div>
                              <p className="font-bold">{item.title}</p>
                              {item.detail && <p className="mt-1 text-sm leading-relaxed opacity-80">{item.detail}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {beforeYouBook.length > 0 && (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest opacity-60">
                        {t.clinic.beforeYouBookTitle}
                      </h3>
                      <ul className="space-y-2.5 rounded-xl border border-[#0D1F1C]/10 p-5 md:rounded-2xl">
                        {beforeYouBook.map((item, i) => (
                          <li key={`byb-${i}`} className="flex gap-3 text-sm leading-relaxed md:text-base">
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#024E44]" aria-hidden="true" />
                            <span>
                              {item.title && <strong>{item.title}. </strong>}
                              {item.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Block>
            )}

            {/* 3.3 SERVICES */}
            {services.length > 0 && (
              <Block id="services" title={t.clinic.servicesTitle}>
                {serviceCategories.length > 1 && (
                  <div className="mb-5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('ALL')}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                        selectedCategory === 'ALL' ? 'bg-[#0D1F1C] text-white' : 'bg-stone-100 hover:bg-stone-200'
                      }`}
                    >
                      {t.clinic.allCategories} ({services.length})
                    </button>
                    {serviceCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                          selectedCategory === cat ? 'bg-[#0D1F1C] text-white' : 'bg-stone-100 hover:bg-stone-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
                <ul className="grid gap-x-8 sm:grid-cols-2">
                  {visibleServices.map((s) => (
                    <li key={s.name} className="flex gap-3 border-b border-[#0D1F1C]/10 py-4">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#024E44]" aria-hidden="true" />
                      <div>
                        <p className="font-bold">{s.name}</p>
                        {s.category && <p className="mt-0.5 text-xs font-semibold text-[#024E44]">{s.category}</p>}
                        {s.description && <p className="mt-1 text-sm leading-relaxed opacity-75">{s.description}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {/* 3.4 PRICING (shown only when public pricing exists) */}
            {hasPricing && (
              <Block id="pricing" title={t.clinic.pricingTitle}>
                {pricingSummary && (pricingSummary.starting_price || pricingSummary.payment_methods || pricingSummary.accepts_hsa_fsa) && (
                  <div className="mb-5 flex flex-wrap items-center gap-6 rounded-xl bg-[#E3F1EC] p-5 md:rounded-2xl">
                    {pricingSummary.starting_price && (
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-widest opacity-60">{t.clinic.startingAt}</span>
                        <span className="text-3xl font-bold">{pricingSummary.starting_price}</span>
                        {pricingSummary.starting_unit && <span className="ml-1.5 text-sm opacity-75">{pricingSummary.starting_unit}</span>}
                      </div>
                    )}
                    {pricingSummary.payment_methods && (
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-widest opacity-60">{t.clinic.paymentMethods}</span>
                        <span className="text-sm font-semibold">{pricingSummary.payment_methods}</span>
                      </div>
                    )}
                    {pricingSummary.accepts_hsa_fsa && (
                      <span className="rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#024E44]">
                        ✓ {t.clinic.hsaFsaAccepted}
                      </span>
                    )}
                  </div>
                )}
                {pricing.length > 0 && (
                  <div className="divide-y divide-[#0D1F1C]/10 rounded-xl border border-[#0D1F1C]/10 px-5 md:rounded-2xl">
                    {pricing.map((item, idx) => (
                      <div key={`${item.name}-${idx}`} className="flex flex-col justify-between gap-2 py-4 sm:flex-row sm:items-center">
                        <div>
                          <p className="font-bold">{item.name}</p>
                          {item.notes && <p className="mt-0.5 text-xs opacity-70">{item.notes}</p>}
                        </div>
                        <span className="shrink-0 text-base font-bold text-[#024E44]">
                          {item.price || item.price_range}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Block>
            )}

            {/* 3.5 INSURANCE */}
            {hasInsurance && (
              <Block id="insurance" title={t.clinic.insuranceTitle}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {insuranceRows.map(([label, yes]) => (
                    <div key={label} className="flex items-center gap-3 rounded-xl bg-stone-50 p-4 md:rounded-2xl">
                      {yes ? (
                        <Check className="h-5 w-5 shrink-0 text-[#024E44]" aria-hidden="true" />
                      ) : (
                        <Minus className="h-5 w-5 shrink-0 opacity-35" aria-hidden="true" />
                      )}
                      <span className={`text-sm font-bold ${yes ? '' : 'opacity-60'}`}>{label}</span>
                    </div>
                  ))}
                </div>
                {networks.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest opacity-60">{t.clinic.acceptedNetworks}</p>
                    <div className="flex flex-wrap gap-2">
                      {networks.map((net) => (
                        <span key={net} className="rounded-full bg-[#E3F1EC] px-3.5 py-1.5 text-xs font-semibold text-[#024E44]">
                          {net}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {insurance?.notes && <p className="mt-4 text-sm opacity-75">{insurance.notes}</p>}
                <p className="mt-3 text-xs opacity-55">{t.clinic.confirmInsuranceNote}</p>
              </Block>
            )}

            {/* 3.6 TEAM */}
            {team.length > 0 && (
              <Block id="team" title={t.clinic.teamTitle}>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {team.map((tm) => (
                    <li key={tm.name} className="flex items-start gap-4 rounded-xl bg-stone-50 p-4 md:rounded-2xl md:p-5">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#E3F1EC] text-sm font-bold text-[#024E44]" aria-hidden="true">
                        {tm.name.replace(/^(dr\.?\s+)/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold leading-tight">
                          {tm.name}
                          {tm.credentials ? `, ${tm.credentials}` : ''}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold opacity-65">
                          {[
                            tm.role,
                            tm.languages_spoken?.map((l) => translateLanguage(l, locale)).join(', '),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {(tm.bio || tm.bio_snippet) && (
                          <p className="mt-2 line-clamp-3 text-xs leading-relaxed opacity-75">{tm.bio || tm.bio_snippet}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {/* 3.7 LOCATION & HOURS */}
            {hasLocation && (
              <Block id="location" title={t.clinic.locationHoursTitle}>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="rounded-xl bg-stone-50 p-5 md:rounded-2xl">
                    <p className="text-xs font-semibold uppercase tracking-widest opacity-60">{t.clinic.addressLabel}</p>
                    <p className="mt-2 text-base font-bold">{address || place}</p>
                    {directions && (
                      <a
                        href={directions}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#024E44] px-4 py-2 text-xs font-bold text-white"
                      >
                        <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> {t.clinic.directions}
                      </a>
                    )}
                    {m.location?.parking && (
                      <div className="mt-4 border-t border-[#0D1F1C]/10 pt-3">
                        <p className="text-xs font-semibold uppercase tracking-widest opacity-60">{t.clinic.parkingLabel}</p>
                        <p className="mt-1 text-sm opacity-80">{m.location.parking}</p>
                      </div>
                    )}
                    {m.location?.transit && (
                      <div className="mt-3 border-t border-[#0D1F1C]/10 pt-3">
                        <p className="text-xs font-semibold uppercase tracking-widest opacity-60">{t.clinic.transitLabel}</p>
                        <p className="mt-1 text-sm opacity-80">{m.location.transit}</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-stone-50 p-5 md:rounded-2xl">
                    <p className="text-xs font-semibold uppercase tracking-widest opacity-60">{t.clinic.weeklyHoursLabel}</p>
                    {hours ? (
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {DAYS.map((d) => (
                          <li key={d} className={`flex justify-between gap-3 ${today === d ? 'font-bold text-[#024E44]' : 'opacity-80'}`}>
                            <span>{DAY_LABELS[d]?.[locale] ?? d.slice(0, 3)}</span>
                            <span className="text-right tabular-nums">{hours[d] || t.clinic.closed}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm opacity-75">{t.clinic.callForHours}</p>
                    )}
                  </div>
                </div>
              </Block>
            )}

            {/* 3.8 REVIEWS */}
            {(reviews.length > 0 || reviewSummary) && (
              <Block id="reviews" title={t.clinic.reviewsTitle}>
                <div className="flex flex-col gap-5 rounded-xl bg-stone-50 p-5 sm:flex-row sm:items-center md:rounded-2xl md:p-7">
                  {rating && (
                    <div className="shrink-0">
                      <span className="block text-6xl font-bold leading-none tracking-tight tabular-nums">{rating.toFixed(1)}</span>
                      <span className="mt-2 flex items-center gap-2 text-xs font-semibold opacity-70">
                        <Stars value={rating} /> {ratingCount.toLocaleString('en-US')}
                      </span>
                    </div>
                  )}
                  {reviewSummary && (
                    <p className="text-sm leading-relaxed opacity-80 sm:border-l sm:border-[#0D1F1C]/10 sm:pl-5 md:text-base">
                      {reviewSummary}
                    </p>
                  )}
                </div>
                {reviews.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {reviews.map((r, i) => (
                      <figure key={`${r.author}-${i}`} className="flex flex-col justify-between gap-4 rounded-xl border border-[#0D1F1C]/10 p-5 md:rounded-2xl">
                        <Stars value={r.rating} size="h-3.5 w-3.5" />
                        <blockquote className="line-clamp-5 text-sm leading-relaxed md:text-base">{r.text}</blockquote>
                        <figcaption className="text-xs font-semibold opacity-60">
                          {r.author} · <span className="capitalize">{r.source}</span>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </Block>
            )}

            {/* 3.9 FAQ */}
            {faqs.length > 0 && (
              <Block id="faq" title={t.clinic.faqTitle}>
                <div className="divide-y divide-[#0D1F1C]/10 border-y border-[#0D1F1C]/10">
                  {faqs.map((f) => (
                    <details key={f.question} className="group">
                      <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3 font-bold [&::-webkit-details-marker]:hidden ${focusRing}`}>
                        {f.question}
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#0D1F1C]/20 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                      </summary>
                      <p className="max-w-[65ch] pb-5 text-sm leading-relaxed opacity-80 md:text-base">{f.answer}</p>
                    </details>
                  ))}
                </div>
              </Block>
            )}

            {/* 3.10 TRUST & CREDENTIALS */}
            <Block id="trust" title={t.clinic.trustTitle}>
              {allCredentials.length > 0 && (
                <div className="mb-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest opacity-60">{t.clinic.credentialsLabel}</p>
                  <div className="flex flex-wrap gap-2">
                    {allCredentials.map((cred) => (
                      <span key={cred} className="rounded-full bg-stone-100 px-3.5 py-1.5 text-xs font-semibold">
                        {cred}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-sm font-semibold text-[#024E44]">
                <Link href="/about" className="underline underline-offset-4 hover:opacity-80">
                  {t.clinic.howWeEvaluate}
                </Link>
                <Link href={`/claim/${c.id}`} className="underline underline-offset-4 hover:opacity-80">
                  {t.clinic.claimOrUpdate}
                </Link>
              </div>
              <p className="mt-4 max-w-[65ch] rounded-xl bg-stone-50 p-4 text-xs leading-relaxed opacity-70 md:rounded-2xl">
                {t.clinic.disclaimer}
              </p>
            </Block>
          </div>

          {/* sticky practical facts: contact, hours, insurance, address */}
          <aside className="lg:sticky lg:top-36 lg:self-start" aria-label="Practical details">
            <div className="rounded-xl bg-stone-50 px-5 py-2 md:rounded-2xl md:px-6">
              <div className="divide-y divide-[#0D1F1C]/10">
                <Fact icon={Phone} label={t.clinic.contactLabel}>
                  <div className="flex flex-col gap-1.5">
                    {phoneHref && <a href={phoneHref} className="text-base font-bold hover:underline">{c.phone}</a>}
                    {website && (
                      <a href={website} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                        {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      </a>
                    )}
                  </div>
                </Fact>
                <Fact icon={MapPin} label={t.clinic.addressLabel}>
                  <p>{address || place}</p>
                  {directions && (
                    <a href={directions} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-bold underline underline-offset-4">
                      <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> {t.clinic.directions}
                    </a>
                  )}
                </Fact>
                <Fact icon={Clock} label={t.clinic.hoursLabel}>
                  {hours ? (
                    <ul className="space-y-1">
                      {DAYS.map((d) => (
                        <li key={d} className={`flex justify-between gap-3 ${today === d ? 'font-bold' : 'opacity-75'}`}>
                          <span>{DAY_LABELS[d]?.[locale] ?? d.slice(0, 3)}</span>
                          <span className="text-right tabular-nums">{hours[d] || t.clinic.closed}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t.clinic.callForHours}</p>
                  )}
                </Fact>
                <Fact icon={ShieldCheck} label={t.clinic.navInsurance}>
                  <ul className="space-y-1.5">
                    {insuranceRows.map(([label, yes]) => (
                      <li key={label} className="flex items-center gap-2">
                        {yes ? (
                          <Check className="h-4 w-4 text-[#024E44]" aria-hidden="true" />
                        ) : (
                          <Minus className="h-4 w-4 opacity-35" aria-hidden="true" />
                        )}
                        <span className={yes ? '' : 'opacity-60'}>{label}</span>
                      </li>
                    ))}
                  </ul>
                  {networks.length > 0 && <p className="mt-2 text-xs opacity-70">{networks.slice(0, 6).join(' · ')}</p>}
                </Fact>
              </div>
            </div>
            {!c.is_claimed && (
              <Link href={`/claim/${c.id}`} className={`mt-2 flex items-center justify-between gap-3 rounded-xl bg-[#0D1F1C] p-5 text-sm font-bold text-white md:rounded-2xl ${focusRing}`}>
                {t.clinic.isThisYourClinic}
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            )}
          </aside>
        </div>

        {/* ================= 4. Similar ================= */}
        {similar.length > 0 && (
          <section className={`${wrap} mt-16 pb-2 md:mt-24`} aria-labelledby="cl-similar">
            <div className="mb-5 flex items-end justify-between gap-4">
              <h2 id="cl-similar" className="text-2xl font-bold tracking-tight md:text-3xl">{t.clinic.similarClinics}</h2>
              <Link href={`${DIRECTORY}${c.specialty ? `?specialty=${encodeURIComponent(c.specialty)}` : ''}`} className="text-sm font-semibold underline underline-offset-4">
                {t.clinic.seeAll}
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-4">
              {similar.map((s) => (
                <Link key={s.id} href={clinicHref(s.slug)} className={`group block ${focusRing} rounded-xl md:rounded-2xl`}>
                  <div className={`${card} aspect-[4/3]`}>
                    <SiteImg src={s.image} fallback={s.fallback} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  </div>
                  <p className="mt-3 font-bold leading-tight group-hover:underline">{s.name}</p>
                  <p className="mt-1 text-sm opacity-70">{s.place}{s.rating && ` · ★ ${s.rating}`}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ================= Fullscreen Lightbox Modal (Portaled to document.body, pinned to 100dvh viewport) ================= */}
      {lightboxOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${c.name} photo gallery`}
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100dvh',
              zIndex: 9999,
              backgroundColor: 'rgba(8, 15, 13, 0.94)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
              padding: '1.25rem',
              color: '#fff',
              fontFamily: "'Be Vietnam Pro', sans-serif",
            }}
          >
            {/* Top bar */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex shrink-0 items-center justify-between gap-4"
            >
              <span className="truncate text-sm font-semibold">
                {c.name} · {safeIdx + 1} / {galleryPhotos.length}
              </span>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                aria-label={t.clinic.closeGallery}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/25"
              >
                <X className="h-4 w-4" /> {t.clinic.closeGallery}
              </button>
            </div>

            {/* Center viewport-constrained image */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                flex: '1 1 0%',
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0.75rem 0',
              }}
            >
              <SiteImg
                key={`lb-${currentPhoto}`}
                src={currentPhoto}
                fallback={photoFallback}
                alt={`${c.name} — ${safeIdx + 1}`}
                eager
                className="rounded-xl object-contain shadow-2xl"
                style={{
                  maxHeight: '72dvh',
                  maxWidth: '90vw',
                  width: 'auto',
                  height: 'auto',
                }}
              />
              {galleryPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => setActiveIdx((i) => (i - 1 + galleryPhotos.length) % galleryPhotos.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/30 md:left-6"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => setActiveIdx((i) => (i + 1) % galleryPhotos.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/30 md:right-6"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {/* Bottom thumbnail strip */}
            {galleryPhotos.length > 1 && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex shrink-0 justify-center gap-2 overflow-x-auto py-1 [scrollbar-width:none]"
              >
                {galleryPhotos.map((src, idx) => (
                  <button
                    key={`lb-thumb-${idx}`}
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg transition ${
                      idx === safeIdx ? 'ring-2 ring-white opacity-100' : 'opacity-50 hover:opacity-85'
                    }`}
                  >
                    <SiteImg src={src} fallback={photoFallback} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
