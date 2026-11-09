import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchFilters } from '@/components/search/search-filters';
import { ClinicGrid } from '@/components/search/clinic-grid';
import { SearchPagination } from '@/components/search/pagination';
import { searchClinics, getSearchFilterOptions } from '@/services/clinic-service';
import { DirectorySearchBar } from '@/components/search/directory-search-bar';
import { ParallaxImage, SplitTitle } from '@/components/lg/motion';

interface SearchUrlParams {
  city?: string;
  state?: string;
  specialty?: string;
  language?: string;
  query?: string;
  insurance?: string;
  minRating?: string;
  telehealth?: string;
  openWeekend?: string;
  acceptingNew?: string;
  priceTier?: string;
  sort?: 'rating' | 'reviews' | 'quality' | 'newest';
  page?: string;
}

interface SearchPageProps {
  searchParams: Promise<SearchUrlParams>;
}

const QUICK_FILTERS = [
  { label: 'Vietnamese Speaking', href: '/search?language=Vietnamese', matchKey: 'language', matchVal: 'Vietnamese' },
  { label: 'Korean Speaking', href: '/search?language=Korean', matchKey: 'language', matchVal: 'Korean' },
  { label: 'Primary Care', href: '/search?specialty=Primary+Care', matchKey: 'specialty', matchVal: 'Primary Care' },
  { label: 'Dental Care', href: '/search?specialty=Dental', matchKey: 'specialty', matchVal: 'Dental' },
  { label: 'Mental Health', href: '/search?specialty=Mental+Health', matchKey: 'specialty', matchVal: 'Mental Health' },
  { label: 'OB/GYN', href: '/search?specialty=OB%2FGYN', matchKey: 'specialty', matchVal: 'OB/GYN' },
  { label: 'Houston, TX', href: '/search?city=Houston', matchKey: 'city', matchVal: 'Houston' },
  { label: 'Los Angeles, CA', href: '/search?city=Los+Angeles', matchKey: 'city', matchVal: 'Los Angeles' },
];

const FAST_ACCESS_PILLS: Array<{
  label: string;
  key: keyof SearchUrlParams;
  val: string;
}> = [
  { label: '★ 4.5+ Rated', key: 'minRating', val: '4.5' },
  { label: 'Open Weekends', key: 'openWeekend', val: 'true' },
  { label: 'Accepting New Patients', key: 'acceptingNew', val: 'true' },
  { label: 'Medicare', key: 'insurance', val: 'Medicare' },
  { label: 'Medicaid / Medi-Cal', key: 'insurance', val: 'Medicaid' },
  { label: 'Telehealth', key: 'telehealth', val: 'true' },
  { label: '$ Sliding Scale', key: 'priceTier', val: '$' },
];

const SORT_OPTIONS: Array<{ label: string; value: 'rating' | 'reviews' | 'quality' | 'newest' }> = [
  { label: 'Top Rated', value: 'rating' },
  { label: 'Most Reviewed', value: 'reviews' },
  { label: 'Verified Data Score', value: 'quality' },
  { label: 'Newest Added', value: 'newest' },
];

function buildModifiedHref(
  params: SearchUrlParams,
  updates: Partial<Record<keyof SearchUrlParams, string | undefined>>,
  removeCityValue?: string
) {
  const sp = new URLSearchParams();
  const merged: Partial<Record<keyof SearchUrlParams, string | undefined>> = {
    ...params,
    ...updates,
  };

  const keys: Array<keyof SearchUrlParams> = [
    'query',
    'language',
    'specialty',
    'city',
    'state',
    'insurance',
    'minRating',
    'telehealth',
    'openWeekend',
    'acceptingNew',
    'priceTier',
    'sort',
  ];

  for (const k of keys) {
    const val = merged[k];
    if (!val) continue;
    if (k === 'city' && removeCityValue) {
      const remaining = val
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c && c !== removeCityValue);
      if (remaining.length > 0) {
        sp.set('city', remaining.join(','));
      }
      continue;
    }
    sp.set(k, val);
  }

  const qs = sp.toString();
  return qs ? `/search?${qs}` : '/search';
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const parts: string[] = [];
  if (params.language) parts.push(params.language);
  if (params.specialty) parts.push(params.specialty);
  if (params.city) parts.push(`in ${params.city.replace(/,/g, ', ')}`);

  const title = parts.length > 0
    ? `${parts.join(' ')} Clinics`
    : 'Find Asian Clinics';

  return {
    title,
    description: `Search ${title.toLowerCase()} that speak your language. Browse verified profiles with reviews, hours, insurance coverage, and contact info.`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const minRating = params.minRating ? Number(params.minRating) : undefined;
  const currentSort = params.sort ?? 'rating';

  const [result, filterOptions] = await Promise.all([
    searchClinics({
      city: params.city,
      state: params.state,
      specialty: params.specialty,
      language: params.language,
      query: params.query,
      insurance: params.insurance,
      minRating: minRating && !Number.isNaN(minRating) ? minRating : undefined,
      telehealth: params.telehealth === 'true',
      openWeekend: params.openWeekend === 'true',
      acceptingNew: params.acceptingNew === 'true',
      priceTier: params.priceTier,
      sort: currentSort,
      page,
      limit: 12,
    }),
    getSearchFilterOptions(),
  ]);

  const totalPages = Math.ceil(result.total / result.limit);
  const selectedCities = params.city
    ? params.city.split(',').map((c) => c.trim()).filter(Boolean)
    : [];
  const hasActiveFilters = Boolean(
    selectedCities.length > 0 ||
      params.specialty ||
      params.language ||
      params.query ||
      params.insurance ||
      params.minRating ||
      params.telehealth ||
      params.openWeekend ||
      params.acceptingNew ||
      params.priceTier
  );

  const headingParts: string[] = [];
  if (params.language) headingParts.push(`${params.language}-Speaking`);
  if (params.specialty) headingParts.push(params.specialty);
  const cityLabel = selectedCities.join(', ');
  const directoryHeading =
    headingParts.length > 0
      ? `${headingParts.join(' ')} Clinics${cityLabel ? ` in ${cityLabel}` : ''}`
      : cityLabel
        ? `Verified Clinics in ${cityLabel}`
        : 'The directory';

  return (
    <div className="lg">
      {/* ===== Directory Hero ===== */}
      <header className="lg-dir-hero">
        <div className="lg-wrap">
          <div className="lg-dir-hero-head">
            <span className="lg-dir-eyebrow">Verified Asian Healthcare Directory</span>
            <SplitTitle
              as="h1"
              text="Find a clinic that speaks your family's language."
              tintFrom={5}
            />
            <p className="lead">
              Asian Health Hub connects Vietnamese, Korean, and Chinese-speaking families with trusted doctors, dentists, and specialists across the United States.
            </p>
          </div>

          <Suspense
            fallback={
              <div className="lg-dir-searchbox h-16 animate-pulse" />
            }
          >
            <DirectorySearchBar />
          </Suspense>

          <div className="lg-dir-quick" aria-label="Popular searches">
            <span className="lbl">Popular:</span>
            {QUICK_FILTERS.map((qf) => {
              const active =
                (qf.matchKey === 'language' && params.language === qf.matchVal) ||
                (qf.matchKey === 'specialty' && params.specialty === qf.matchVal) ||
                (qf.matchKey === 'city' && selectedCities.includes(qf.matchVal));
              return (
                <Link
                  key={qf.label}
                  href={qf.href}
                  className={active ? 'is-active' : undefined}
                >
                  {qf.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* ===== Main Directory Body ===== */}
      <section className="lg-dir-body">
        <div className="lg-wrap">
          {/* Starting Point Cards (Longevity Directory Style) */}
          <div className="lg-dir-start">
            <div className="lg-eyebrow mb-3">Choose a starting point</div>
            <div className="lg-dir-start-grid">
              <Link href="/search?language=Vietnamese" className="lg-dir-scard">
                <div className="top">
                  <b>{filterOptions.languages.find((l) => l.value === 'Vietnamese')?.count ?? 102}</b>{' '}
                  <span>clinics</span>
                </div>
                <span className="bar" />
                <h3>Vietnamese-speaking care</h3>
                <p>Primary care, dental, OB/GYN, and specialist clinics with bilingual Vietnamese staff.</p>
              </Link>

              <Link href="/search?openWeekend=true" className="lg-dir-scard">
                <div className="top">
                  <b>Weekend</b> <span>access</span>
                </div>
                <span className="bar" />
                <h3>Open Saturday &amp; Sunday</h3>
                <p>Verified clinics with Saturday or Sunday hours so working families can visit together.</p>
              </Link>

              <a href="#insurance-filter" className="lg-dir-scard">
                <div className="top">
                  <b>Coverage</b>
                </div>
                <span className="bar" />
                <h3>Browse by insurance</h3>
                <p>Filter by Medicare, Medicaid, Blue Cross Blue Shield, Cigna, Aetna, or Delta Dental.</p>
              </a>

              <a href="#specialty-filter" className="lg-dir-scard">
                <div className="top">
                  <b>A–Z</b>
                </div>
                <span className="bar" />
                <h3>Specialty index</h3>
                <p>Browse every clinical specialty currently listed in the directory, from Primary Care to Dental.</p>
              </a>
            </div>
          </div>

          {/* Progressive-Disclosure Quick Access Bar (Track B) */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#024E44]/12 bg-white/80 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#024E44]/70 mr-1">
                Quick filters:
              </span>
              {FAST_ACCESS_PILLS.map((pill) => {
                const isActive = params[pill.key] === pill.val;
                const nextHref = buildModifiedHref(params, {
                  [pill.key]: isActive ? undefined : pill.val,
                });
                return (
                  <Link
                    key={pill.label}
                    href={nextHref}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'border-[#024E44] bg-[#024E44] text-white'
                        : 'border-[#024E44]/15 bg-[#F6FAF8] text-[#0D1F1C] hover:border-[#024E44]/40'
                    }`}
                  >
                    <span>{pill.label}</span>
                    {isActive && <span aria-hidden="true">×</span>}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-[#0D1F1C]/60 mr-1">Sort:</span>
              {SORT_OPTIONS.map((opt) => {
                const active = currentSort === opt.value;
                const href = buildModifiedHref(params, {
                  sort: opt.value === 'rating' ? undefined : opt.value,
                });
                return (
                  <Link
                    key={opt.value}
                    href={href}
                    className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                      active
                        ? 'bg-[#024E44]/12 font-semibold text-[#024E44]'
                        : 'text-[#0D1F1C]/70 hover:text-[#024E44]'
                    }`}
                  >
                    {opt.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="lg-dir-bar">
            <div>
              <h2>{directoryHeading}</h2>
              {hasActiveFilters && (
                <div className="lg-dir-active-tags mt-2">
                  {params.query && (
                    <Link
                      href={buildModifiedHref(params, { query: undefined })}
                      className="lg-dir-active-pill"
                      title="Remove keyword filter"
                    >
                      <span>Keyword: “{params.query}”</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.language && (
                    <Link
                      href={buildModifiedHref(params, { language: undefined })}
                      className="lg-dir-active-pill"
                      title="Remove language filter"
                    >
                      <span>{params.language}</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.specialty && (
                    <Link
                      href={buildModifiedHref(params, { specialty: undefined })}
                      className="lg-dir-active-pill"
                      title="Remove specialty filter"
                    >
                      <span>{params.specialty}</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.insurance && (
                    <Link
                      href={buildModifiedHref(params, { insurance: undefined })}
                      className="lg-dir-active-pill"
                      title="Remove insurance filter"
                    >
                      <span>Insurance: {params.insurance}</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.priceTier && (
                    <Link
                      href={buildModifiedHref(params, { priceTier: undefined })}
                      className="lg-dir-active-pill"
                      title="Remove price tier filter"
                    >
                      <span>Tier: {params.priceTier}</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.minRating && (
                    <Link
                      href={buildModifiedHref(params, { minRating: undefined })}
                      className="lg-dir-active-pill"
                      title="Remove rating filter"
                    >
                      <span>{params.minRating}+ ★</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.openWeekend === 'true' && (
                    <Link
                      href={buildModifiedHref(params, { openWeekend: undefined })}
                      className="lg-dir-active-pill"
                      title="Remove weekend filter"
                    >
                      <span>Open Weekends</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.acceptingNew === 'true' && (
                    <Link
                      href={buildModifiedHref(params, { acceptingNew: undefined })}
                      className="lg-dir-active-pill"
                      title="Remove accepting new patients filter"
                    >
                      <span>Accepting New Patients</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.telehealth === 'true' && (
                    <Link
                      href={buildModifiedHref(params, { telehealth: undefined })}
                      className="lg-dir-active-pill"
                      title="Remove telehealth filter"
                    >
                      <span>Telehealth</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {selectedCities.map((c) => (
                    <Link
                      key={c}
                      href={buildModifiedHref(params, {}, c)}
                      className="lg-dir-active-pill"
                      title={`Remove ${c} filter`}
                    >
                      <span>{c}</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  ))}
                  <Link href="/search" className="lg-dir-clear">
                    Clear all filters
                  </Link>
                </div>
              )}
            </div>

            <div className="lg-dir-count">
              <b>{result.total.toLocaleString('en-US')}</b> organizations
            </div>
          </div>

          <div className="lg-dir-cols">
            <Suspense fallback={null}>
              <SearchFilters
                specialties={filterOptions.specialties}
                languages={filterOptions.languages}
                cities={filterOptions.cities}
                insurances={filterOptions.insurances}
                priceTiers={filterOptions.priceTiers}
              />
            </Suspense>

            <div className="min-w-0">
              <ClinicGrid clinics={result.data} total={result.total} />

              <Suspense fallback={null}>
                <SearchPagination currentPage={page} totalPages={totalPages} />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Bottom Film CTA ===== */}
      <section className="lg-film">
        <div className="lg-wrap">
          <div className="lg-panel">
            <ParallaxImage src="/brand/lg/family.jpg" alt="Asian family care" />
            <div className="copy">
              <span className="lg-eyebrow" style={{ color: 'var(--lg-lime)' }}>
                For Healthcare Providers
              </span>
              <SplitTitle
                as="h2"
                text="Run a clinic that serves Asian American patients?"
                tintFrom={5}
              />
              <p>
                Claim your free clinic profile to verify bilingual staff, insurance plans, and appointment availability for thousands of local families.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <Link href="/claim" className="lg-cta lg-cta--lime">
                  <span>Claim Your Free Profile</span>
                  <span className="arr" aria-hidden="true">→</span>
                </Link>
                <Link href="/about" className="lg-cta lg-cta--line">
                  <span>How Verification Works</span>
                  <span className="arr" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
