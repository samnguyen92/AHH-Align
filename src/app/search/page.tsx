import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchFilters } from '@/components/search/search-filters';
import { ClinicGrid } from '@/components/search/clinic-grid';
import { SearchPagination } from '@/components/search/pagination';
import { searchClinics, getSearchFilterOptions } from '@/services/clinic-service';
import { DirectorySearchBar } from '@/components/search/directory-search-bar';
import { ParallaxImage, SplitTitle } from '@/components/lg/motion';

interface SearchPageProps {
  searchParams: Promise<{
    city?: string;
    state?: string;
    specialty?: string;
    language?: string;
    query?: string;
    page?: string;
  }>;
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

function buildRemoveFilterHref(
  params: { city?: string; state?: string; specialty?: string; language?: string; query?: string },
  removeKey: 'query' | 'language' | 'specialty' | 'city',
  removeCityValue?: string
) {
  const sp = new URLSearchParams();
  if (params.query && removeKey !== 'query') sp.set('query', params.query);
  if (params.language && removeKey !== 'language') sp.set('language', params.language);
  if (params.specialty && removeKey !== 'specialty') sp.set('specialty', params.specialty);
  if (params.city) {
    if (removeKey === 'city' && removeCityValue) {
      const remaining = params.city
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c && c !== removeCityValue);
      if (remaining.length > 0) {
        sp.set('city', remaining.join(','));
      }
    } else if (removeKey !== 'city') {
      sp.set('city', params.city);
    }
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
    description: `Search ${title.toLowerCase()} that speak your language. Browse verified profiles with reviews, hours, and contact info.`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const [result, filterOptions] = await Promise.all([
    searchClinics({
      city: params.city,
      state: params.state,
      specialty: params.specialty,
      language: params.language,
      query: params.query,
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
    selectedCities.length > 0 || params.specialty || params.language || params.query
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

              <Link href="/search" className="lg-dir-scard">
                <div className="top">
                  <b>{result.total > 0 ? result.total : 244}</b> <span>organizations</span>
                </div>
                <span className="bar" />
                <h3>In-person care</h3>
                <p>Consults, diagnostics, preventive check-ups, and family care delivered at a verified clinic.</p>
              </Link>

              <a href="#city-filter" className="lg-dir-scard">
                <div className="top">
                  <b>Place</b>
                </div>
                <span className="bar" />
                <h3>Browse by location</h3>
                <p>Select one or multiple cities at once—Houston, Los Angeles, San Jose, Seattle, and more.</p>
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

          <div className="lg-dir-bar">
            <div>
              <h2>{directoryHeading}</h2>
              {hasActiveFilters && (
                <div className="lg-dir-active-tags mt-2">
                  {params.query && (
                    <Link
                      href={buildRemoveFilterHref(params, 'query')}
                      className="lg-dir-active-pill"
                      title="Remove keyword filter"
                    >
                      <span>Keyword: “{params.query}”</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.language && (
                    <Link
                      href={buildRemoveFilterHref(params, 'language')}
                      className="lg-dir-active-pill"
                      title="Remove language filter"
                    >
                      <span>{params.language}</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {params.specialty && (
                    <Link
                      href={buildRemoveFilterHref(params, 'specialty')}
                      className="lg-dir-active-pill"
                      title="Remove specialty filter"
                    >
                      <span>{params.specialty}</span>
                      <span aria-hidden="true">×</span>
                    </Link>
                  )}
                  {selectedCities.map((c) => (
                    <Link
                      key={c}
                      href={buildRemoveFilterHref(params, 'city', c)}
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
