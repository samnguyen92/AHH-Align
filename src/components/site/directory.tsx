'use client';

// The clinic directory (/search), organised for scanning: one heading and search,
// the language switch (the first decision), filters in a sidebar, then a calm, even grid of results.
import Link from 'next/link';
import { Check, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import type { DirClinic, DirectoryData, DirectoryParams } from './types';
import { SiteImg } from './img';
import { INK, DIRECTORY, card, focusRing, clinicHref } from './kit';

const KEYS: (keyof DirectoryParams)[] = [
  'query', 'language', 'specialty', 'city', 'state', 'insurance', 'telehealth', 'acceptingNew', 'openWeekend', 'minRating', 'priceTier', 'sort',
];
const wrap = 'w-full px-3 md:px-5';

/** the current search with some keys changed (undefined removes a key); back to page 1 unless page is set */
function hrefWith(params: DirectoryParams, updates: Partial<DirectoryParams>) {
  const merged: DirectoryParams = { ...params, page: undefined, ...updates };
  const sp = new URLSearchParams();
  for (const k of [...KEYS, 'page' as const]) {
    const v = merged[k];
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${DIRECTORY}?${qs}` : DIRECTORY;
}

const toggle = (params: DirectoryParams, key: keyof DirectoryParams, value: string) =>
  hrefWith(params, { [key]: params[key] === value ? undefined : value });

const SORTS: [NonNullable<DirectoryParams['sort']>, string][] = [
  ['rating', 'Top rated'],
  ['reviews', 'Most reviewed'],
  ['newest', 'Newest'],
];

const TOGGLES: [keyof DirectoryParams, string, string][] = [
  ['acceptingNew', 'true', 'Accepting new patients'],
  ['telehealth', 'true', 'Offers telehealth'],
  ['openWeekend', 'true', 'Open weekends'],
  ['minRating', '4.5', 'Rated 4.5 and up'],
  ['insurance', 'Medicare', 'Accepts Medicare'],
  ['insurance', 'Medicaid', 'Accepts Medicaid / Medi-Cal'],
  ['priceTier', '$', 'Sliding-scale fees'],
];

const LABELS: Partial<Record<keyof DirectoryParams, (v: string) => string>> = {
  query: (v) => `“${v}”`,
  language: (v) => v,
  specialty: (v) => v,
  city: (v) => v,
  state: (v) => v,
  insurance: (v) => v,
  telehealth: () => 'Telehealth',
  openWeekend: () => 'Open weekends',
  priceTier: () => 'Sliding-scale fees',
  acceptingNew: () => 'Accepting new patients',
  minRating: (v) => `${v}+ stars`,
};

function headingFor(p: DirectoryParams) {
  const lead = [p.language && `${p.language}-speaking`, p.specialty].filter(Boolean).join(' ');
  if (!lead && !p.city) return 'Find a clinic';
  return `${lead ? `${lead} clinics` : 'Clinics'}${p.city ? ` in ${p.city}` : ''}`;
}

/** a sidebar option: a row that reads like a checkbox list */
function Option({ href, on, label, count }: { href: string; on: boolean; label: string; count?: number }) {
  return (
    <Link
      href={href}
      aria-current={on ? 'true' : undefined}
      className={`flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm transition-colors hover:bg-white ${on ? 'font-bold' : 'font-medium'} ${focusRing}`}
    >
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? 'border-[#024E44] bg-[#024E44] text-white' : 'border-[#0D1F1C]/25 bg-white'}`} aria-hidden="true">
        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums opacity-50">{count}</span>}
    </Link>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[#0D1F1C]/10 py-4 first:border-t-0 first:pt-0">
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-widest opacity-55">{title}</p>
      {children}
    </div>
  );
}

function ResultCard({ c }: { c: DirClinic }) {
  return (
    <Link href={clinicHref(c.slug)} className={`group flex flex-col rounded-xl md:rounded-2xl ${focusRing}`}>
      <div className={`${card} aspect-[4/3]`}>
        <SiteImg src={c.image} fallback={c.fallback} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        {c.accepting && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-[#024E44] backdrop-blur-md">Accepting new patients</span>
        )}
      </div>
      <div className="px-1 pt-3">
        <p className="text-xs font-semibold opacity-60">{c.specialty}</p>
        <h3 className="mt-1 text-lg font-bold leading-tight group-hover:underline">{c.name}</h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm">
          {c.rating && (
            <span className="inline-flex items-center gap-1 font-bold">
              <Star className="h-3.5 w-3.5 text-[#024E44]" fill="currentColor" aria-hidden="true" />
              {c.rating}
              <span className="font-medium opacity-55">({c.reviews.toLocaleString('en-US')})</span>
            </span>
          )}
          <span className="opacity-70">{c.place}</span>
        </p>
        <p className="mt-2.5 flex flex-wrap gap-1">
          {c.langs.map((l) => (
            <span key={l} className="rounded-full bg-[#E3F1EC] px-2.5 py-0.5 text-xs font-semibold text-[#024E44]">{l}</span>
          ))}
          {c.telehealth && <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold">Telehealth</span>}
        </p>
      </div>
    </Link>
  );
}

/** Local landing pages (/[state]/[city], /[state]/[city]/[specialty]) reuse the directory with their own heading and links. */
export type DirectoryIntro = {
  eyebrow: string;
  title: string;
  lede?: string;
  back?: { href: string; label: string };
  related?: { href: string; label: string }[];
};

export function DirectoryPage({ data, intro }: { data: DirectoryData; intro?: DirectoryIntro }) {
  const p = data.params;
  const from = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = Math.min(data.total, data.page * data.pageSize);
  const active = KEYS.filter((k) => k !== 'sort' && p[k]);
  const sort = p.sort ?? 'rating';

  const filters = (
    <>
      <FilterGroup title="Specialty">
        {data.specialties.map((s) => (
          <Option key={s.value} href={toggle(p, 'specialty', s.value)} on={p.specialty === s.value} label={s.value} count={s.count} />
        ))}
      </FilterGroup>
      <FilterGroup title="City">
        {data.cities.map((c) => (
          <Option key={`${c.value}-${c.state}`} href={toggle(p, 'city', c.value)} on={p.city === c.value} label={`${c.value}, ${c.state}`} count={c.count} />
        ))}
      </FilterGroup>
      <FilterGroup title="More">
        {TOGGLES.map(([k, v, label]) => (
          <Option key={`${k}-${v}`} href={toggle(p, k, v)} on={p[k] === v} label={label} />
        ))}
      </FilterGroup>
    </>
  );

  return (
    <div className="site-a bg-white" style={{ fontFamily: "'Be Vietnam Pro', sans-serif", color: INK }}>
      {/* three tiles across the full width: find a clinic on top, filters on the left, results on the right */}
      <div className="pb-2 pt-20 md:pb-3 md:pt-[5.375rem]">
        {/* ================= 1. Heading + search ================= */}
        <header className={wrap}>
          <div className="rounded-xl bg-stone-50 p-5 md:rounded-2xl md:p-8">
            {intro?.back && (
              <Link href={intro.back.href} className="mb-3 inline-flex text-sm font-semibold underline-offset-4 hover:underline">
                ← {intro.back.label}
              </Link>
            )}
            <p className="text-xs font-semibold uppercase tracking-widest opacity-55">{intro?.eyebrow ?? 'Directory'}</p>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-8">
              <h1 className="max-w-[20ch] text-[clamp(2.25rem,5vw,4.5rem)] font-bold leading-[0.95] tracking-tight">{intro?.title ?? headingFor(p)}</h1>
              <p className="shrink-0 text-sm font-semibold opacity-70 md:pb-2 md:text-base">
                <span className="tabular-nums">{data.total}</span> {data.total === 1 ? 'clinic' : 'clinics'}
              </p>
            </div>
            {intro?.lede && <p className="mt-4 max-w-[60ch] text-sm leading-relaxed opacity-75 md:text-base">{intro.lede}</p>}
            <form action={DIRECTORY} method="get" role="search" className="mt-6 flex w-full items-center gap-2 rounded-full bg-white p-1.5 pl-5 ring-1 ring-[#0D1F1C]/10 focus-within:ring-[#024E44] md:mt-8">
              {KEYS.filter((k) => k !== 'query').map((k) =>
                p[k] ? <input key={k} type="hidden" name={k} value={p[k]} /> : null,
              )}
              <Search className="h-5 w-5 shrink-0 opacity-50" aria-hidden="true" />
              <label htmlFor="dir-q" className="sr-only">Search clinics</label>
              <input
                id="dir-q"
                name="query"
                type="search"
                defaultValue={p.query}
                placeholder="Search clinics"
                className="h-11 min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-[#0D1F1C]/45"
              />
              <button type="submit" className={`h-12 shrink-0 rounded-full bg-[#024E44] px-6 text-sm font-bold text-white btn-fx ${focusRing}`}>
                Search
              </button>
            </form>

            {/* language: the first decision, so it is a full-width switch, not a filter */}
            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label="Language">
              {[{ value: '', native: 'All languages', lang: undefined as string | undefined, count: undefined as number | undefined }, ...data.languages].map((l) => {
                const on = (p.language ?? '') === l.value;
                return (
                  <Link
                    key={l.value || 'all'}
                    href={hrefWith(p, { language: l.value || undefined })}
                    aria-current={on ? 'true' : undefined}
                    className={`flex min-h-12 items-center justify-between gap-2 rounded-full px-4 text-sm font-bold transition-colors sm:min-h-14 sm:px-5 sm:text-base ${focusRing} ${
                      on ? 'bg-[#0D1F1C] text-white' : 'bg-white hover:bg-[#E3F1EC]'
                    }`}
                  >
                    <span lang={l.lang} className="truncate">{l.native}</span>
                    {l.count !== undefined && <span className="text-xs font-semibold tabular-nums opacity-60">{l.count}</span>}
                  </Link>
                );
              })}
            </div>
            {intro?.related?.length ? (
              <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="Nearby searches">
                {intro.related.map((r) => (
                  <Link key={r.href} href={r.href} className={`rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-[#0D1F1C]/10 transition-colors hover:bg-[#E3F1EC] ${focusRing}`}>
                    {r.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
        </header>

        {/* ================= 2. Filters + results ================= */}
        <div className={`${wrap} mt-2 grid gap-2 md:mt-3 md:gap-3 lg:grid-cols-[19rem_minmax(0,1fr)]`}>
          <aside aria-label="Filters" className="rounded-xl bg-[#E3F1EC] md:rounded-2xl">
            {/* phones: filters fold away behind one button */}
            <details className="group lg:hidden">
              <summary className={`flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-bold [&::-webkit-details-marker]:hidden ${focusRing}`}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
                {active.length > 0 && <span className="rounded-full bg-[#024E44] px-2 text-xs text-white">{active.length}</span>}
              </summary>
              <div className="px-2 pb-4">{filters}</div>
            </details>
            {/* desktop: the tile runs the full height of the results; the list inside stays in view while scrolling */}
            <div className="site-scroll hidden p-3 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto md:p-4">{filters}</div>
          </aside>

          <section aria-labelledby="dir-results" className="min-w-0 rounded-xl bg-stone-50 p-4 md:rounded-2xl md:p-6">
            <div className="flex flex-col gap-3 border-b border-[#0D1F1C]/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="dir-results" className="text-sm font-semibold">
                {data.total ? `Showing ${from}–${to} of ${data.total}` : 'No clinics match'}
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <span className="hidden opacity-60 sm:inline">Sort</span>
                <div className="flex gap-1 rounded-full bg-stone-100 p-1" role="group" aria-label="Sort">
                  {SORTS.map(([v, label]) => (
                    <Link
                      key={v}
                      href={hrefWith(p, { sort: v === 'rating' ? undefined : v })}
                      aria-current={sort === v ? 'true' : undefined}
                      className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-3 text-xs md:px-3.5 font-semibold transition-colors md:text-sm ${focusRing} ${
                        sort === v ? 'bg-white shadow-sm' : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {active.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-4">
                {active.map((k) => (
                  <Link
                    key={k}
                    href={hrefWith(p, { [k]: undefined })}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#E3F1EC] pl-3.5 pr-2.5 text-sm font-semibold text-[#024E44] transition-colors hover:bg-[#D3EAE2] ${focusRing}`}
                  >
                    {LABELS[k]?.(p[k] as string) ?? p[k]}
                    <X className="h-3.5 w-3.5" aria-label="Remove" />
                  </Link>
                ))}
                <Link href={DIRECTORY} className="ml-1 text-sm font-semibold underline underline-offset-4">Clear all</Link>
              </div>
            )}

            {data.clinics.length ? (
              <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                {data.clinics.map((c) => (
                  <ResultCard key={c.id} c={c} />
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-xl bg-white p-6 md:rounded-2xl md:p-10">
                <h3 className="text-2xl font-bold md:text-3xl">No clinics match all of these filters</h3>
                <p className="mt-2 text-sm opacity-75 md:text-base">Remove one filter above, or start again.</p>
                <Link href={DIRECTORY} className={`mt-6 inline-flex rounded-full bg-[#0D1F1C] px-6 py-3 text-sm font-bold text-white ${focusRing}`}>
                  See all clinics
                </Link>
              </div>
            )}

            {data.totalPages > 1 && (
              <nav className="mt-10 flex items-center justify-between gap-3 border-t border-[#0D1F1C]/10 pt-6" aria-label="Pages">
                <PageLink href={data.page > 1 ? hrefWith(p, { page: String(data.page - 1) }) : null} label="Previous" />
                <span className="text-sm font-semibold tabular-nums opacity-70">Page {data.page} of {data.totalPages}</span>
                <PageLink href={data.page < data.totalPages ? hrefWith(p, { page: String(data.page + 1) }) : null} label="Next" />
              </nav>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function PageLink({ href, label }: { href: string | null; label: string }) {
  const cls = 'inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold';
  return href ? (
    <Link href={href} className={`${cls} border border-[#0D1F1C]/25 transition-colors hover:border-[#0D1F1C] ${focusRing}`}>{label}</Link>
  ) : (
    <span className={`${cls} border border-[#0D1F1C]/10 opacity-40`} aria-hidden="true">{label}</span>
  );
}
