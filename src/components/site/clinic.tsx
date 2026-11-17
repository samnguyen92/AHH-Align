'use client';

// one clinic's profile in option A's language (rounded tiles, ink, mint and cream), but
// read like a document: who the clinic is and how to reach it first, the decision facts next to the photo,
// then one calm reading column with the practical facts in a sticky sidebar.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, ChevronRight, Clock, Globe, MapPin, Minus, Navigation, Phone, ShieldCheck, Star, Video } from 'lucide-react';
import type { ClinicPageData } from './types';
import type { ServiceOffering, WorkingHours } from '@/types/database';
import { SiteImg } from './img';
import { Roll } from './ui';
import { INK, DIRECTORY, card, focusRing, clinicHref } from './kit';

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
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 border-t border-[#0D1F1C]/10 py-10 first:border-t-0 first:pt-0 md:py-14">
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
  const { clinic: c, photo, langs, similar } = data;
  const m = c.metadata ?? {};
  const today = useToday();

  const rating = typeof m.rating === 'number' ? m.rating : null;
  const ratingCount = m.rating_count ?? 0;
  const place = [c.city, c.state].filter(Boolean).join(', ');
  const street = c.address?.split(',')[0]?.trim();
  const address = [street, c.city, [c.state, c.zip_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const about = clean(m.about_highlight) || clean(c.description) || clean(m.short_description);
  const languageNote = clean(m.language_note) || clean(m.cultural_context);
  const website = m.website || m.google_website_url || m.appointment?.appointment_url || m.appointment_url;
  const phoneHref = c.phone ? `tel:${c.phone.replace(/[^0-9+]/g, '')}` : null;
  const directions =
    m.google_maps_uri || m.google_maps_url || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name} ${address}`)}` : null);
  const hours = m.working_hours && Object.keys(m.working_hours).length ? m.working_hours : null;
  const services: ServiceOffering[] = (m.services_offered?.length ? m.services_offered : m.services ?? [])
    .map((s) => (typeof s === 'string' ? { name: s } : s))
    .filter((s) => s.name)
    .slice(0, 10);
  const insurance = m.insurance;
  const networks = (insurance?.accepted_networks?.length ? insurance.accepted_networks : m.insurance_accepted ?? []).slice(0, 8);
  const reviews = (m.reviews ?? []).filter((r) => r.text?.trim()).slice(0, 4);
  const team = (m.team_members ?? []).slice(0, 6);
  const faqs = (m.faqs ?? []).slice(0, 6);
  const speaksEnglish = c.languages.some((l) => l.toLowerCase() === 'english');
  const insuranceRows: [string, boolean | null | undefined][] = [
    ['Medicare', insurance?.accepts_medicare],
    ['Medicaid / Medi-Cal', insurance?.accepts_medicaid],
    ['Private insurance', insurance?.accepts_private_insurance],
  ];
  const todayHours = today && hours ? hours[today] || 'Closed' : null;

  const nav = [
    about && ['about', 'About'],
    services.length > 0 && ['services', 'Services'],
    (reviews.length > 0 || m.review_summary) && ['reviews', 'Reviews'],
    team.length > 0 && ['team', 'Team'],
    faqs.length > 0 && ['faq', 'FAQ'],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="site-a bg-white" style={{ fontFamily: "'Be Vietnam Pro', sans-serif", color: INK }}>
      <div className="pt-20 pb-10 md:pt-[5.375rem] md:pb-16">
        {/* ================= 1. Identity + actions ================= */}
        <header className={`${wrap} pb-6 pt-4 md:pb-8 md:pt-8`}>
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-semibold opacity-60">
            <Link href={DIRECTORY} className="hover:underline">Directory</Link>
            {c.specialty && (
              <>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <Link href={`${DIRECTORY}?specialty=${encodeURIComponent(c.specialty)}`} className="hover:underline">{c.specialty}</Link>
              </>
            )}
            {c.city && (
              <>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <Link href={`${DIRECTORY}?city=${encodeURIComponent(c.city)}`} className="hover:underline">{c.city}</Link>
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
                    <span className="opacity-60">({ratingCount.toLocaleString('en-US')} reviews)</span>
                  </a>
                )}
                {c.specialty && <span className="opacity-70">{c.specialty}</span>}
                <span className="inline-flex items-center gap-1.5 opacity-70"><MapPin className="h-4 w-4" aria-hidden="true" />{place}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {phoneHref && (
                <a href={phoneHref} className={`inline-flex min-h-12 items-center gap-2 whitespace-nowrap rounded-full bg-[#024E44] px-6 text-sm font-bold text-white btn-fx ${focusRing}`}>
                  <Phone className="h-4 w-4" aria-hidden="true" /> <Roll>{`Call ${c.phone}`}</Roll>
                </a>
              )}
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-12 items-center gap-2 rounded-full border border-[#0D1F1C]/25 px-6 text-sm font-bold btn-fx btn-fx--green ${focusRing}`}>
                  <Globe className="h-4 w-4" aria-hidden="true" /> <Roll>Website</Roll>
                </a>
              )}
            </div>
          </div>
        </header>

        {/* ================= 2. Photo + at a glance ================= */}
        <div className={`${wrap} grid gap-2 md:grid-cols-3 md:gap-3`}>
          <div className={`${card} aspect-[4/3] md:col-span-2 md:aspect-auto md:min-h-[28rem]`}>
            <SiteImg src={photo} fallback={photo} alt="" eager className="absolute inset-0 h-full w-full object-cover" />
          </div>
          {/* the four facts a family checks before calling, in the order they check them */}
          <div className="flex flex-col rounded-xl bg-[#E3F1EC] p-5 md:rounded-2xl md:p-7">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-60">At a glance</p>
            <dl className="mt-4 flex flex-1 flex-col divide-y divide-[#0D1F1C]/10">
              <div className="pb-4">
                <dt className="text-xs font-semibold opacity-60">Staff speak</dt>
                <dd className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {langs.map((l) => (
                    <span key={l} lang={NATIVE[l]?.lang} className="text-2xl font-bold leading-none md:text-3xl">{NATIVE[l]?.text ?? l}</span>
                  ))}
                  {speaksEnglish && <span className="text-sm font-semibold opacity-60">and English</span>}
                </dd>
              </div>
              <div className="py-4">
                <dt className="text-xs font-semibold opacity-60">New patients</dt>
                <dd className="mt-1 text-base font-bold">
                  {m.accepting_new_patients ? 'Accepting new patients' : m.accepting_new_patients === false ? 'Not taking new patients' : 'Ask the clinic'}
                </dd>
              </div>
              <div className="py-4">
                <dt className="text-xs font-semibold opacity-60">Today</dt>
                <dd className="mt-1 text-base font-bold">{todayHours ?? (hours ? '—' : 'Call for hours')}</dd>
              </div>
              <div className="pt-4">
                <dt className="text-xs font-semibold opacity-60">Visit</dt>
                <dd className="mt-1 text-base font-bold">
                  {c.is_telehealth_available ? (
                    <span className="inline-flex items-center gap-2"><Video className="h-4 w-4" aria-hidden="true" />In person or video</span>
                  ) : (
                    'In person'
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* ================= 3. Reading column + sticky facts ================= */}
        <div className={`${wrap} mt-10 grid gap-10 md:mt-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16`}>
          <div className="min-w-0">
            {nav.length > 1 && (
              <nav aria-label="On this page" className="mb-10 flex gap-1 overflow-x-auto rounded-full bg-stone-100 p-1 [scrollbar-width:none] md:mb-14 md:inline-flex">
                {nav.map(([id, label]) => (
                  <a key={id} href={`#${id}`} className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors hover:bg-white ${focusRing}`}>
                    {label}
                  </a>
                ))}
              </nav>
            )}

            {about && (
              <Block id="about" title="About">
                <p className="max-w-[65ch] text-base leading-relaxed opacity-85 md:text-lg">{about}</p>
                {languageNote && (
                  <p className="mt-6 max-w-[65ch] rounded-xl bg-[#FBF4EC] p-5 text-sm leading-relaxed md:rounded-2xl md:text-base">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-widest opacity-60">Language support</span>
                    {languageNote}
                  </p>
                )}
              </Block>
            )}

            {services.length > 0 && (
              <Block id="services" title="Services">
                <ul className="grid gap-x-8 sm:grid-cols-2">
                  {services.map((s) => (
                    <li key={s.name} className="flex gap-3 border-b border-[#0D1F1C]/10 py-4">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#024E44]" aria-hidden="true" />
                      <div>
                        <p className="font-bold">{s.name}</p>
                        {s.description && <p className="mt-1 line-clamp-2 text-sm opacity-70">{s.description}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {(reviews.length > 0 || m.review_summary) && (
              <Block id="reviews" title="What patients say">
                <div className="flex flex-col gap-5 rounded-xl bg-stone-50 p-5 sm:flex-row sm:items-center md:rounded-2xl md:p-7">
                  {rating && (
                    <div className="shrink-0">
                      <span className="block text-6xl font-bold leading-none tracking-tight tabular-nums">{rating.toFixed(1)}</span>
                      <span className="mt-2 flex items-center gap-2 text-xs font-semibold opacity-70"><Stars value={rating} /> {ratingCount.toLocaleString('en-US')}</span>
                    </div>
                  )}
                  {m.review_summary && <p className="text-sm leading-relaxed opacity-80 sm:border-l sm:border-[#0D1F1C]/10 sm:pl-5 md:text-base">{clean(m.review_summary)}</p>}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
              </Block>
            )}

            {team.length > 0 && (
              <Block id="team" title="Team">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {team.map((t) => (
                    <li key={t.name} className="flex items-center gap-4 rounded-xl bg-stone-50 p-4 md:rounded-2xl">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-sm font-bold" aria-hidden="true">
                        {t.name.replace(/^(dr\.?\s+)/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold leading-tight">{t.name}</p>
                        <p className="mt-0.5 text-xs font-semibold opacity-60">
                          {[t.role, t.languages_spoken?.join(', ')].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {faqs.length > 0 && (
              <Block id="faq" title="Questions families ask">
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
          </div>

          {/* sticky practical facts: contact, hours, insurance, address */}
          <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Practical details">
            <div className="rounded-xl bg-stone-50 px-5 py-2 md:rounded-2xl md:px-6">
              <div className="divide-y divide-[#0D1F1C]/10">
                <Fact icon={Phone} label="Contact">
                  <div className="flex flex-col gap-1.5">
                    {phoneHref && <a href={phoneHref} className="text-base font-bold hover:underline">{c.phone}</a>}
                    {website && <a href={website} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">{website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>}
                  </div>
                </Fact>
                <Fact icon={MapPin} label="Address">
                  <p>{address || place}</p>
                  {directions && (
                    <a href={directions} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-bold underline underline-offset-4">
                      <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> Directions
                    </a>
                  )}
                </Fact>
                <Fact icon={Clock} label="Hours">
                  {hours ? (
                    <ul className="space-y-1">
                      {DAYS.map((d) => (
                        <li key={d} className={`flex justify-between gap-3 ${today === d ? 'font-bold' : 'opacity-75'}`}>
                          <span className="capitalize">{d.slice(0, 3)}</span>
                          <span className="text-right tabular-nums">{hours[d] || 'Closed'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Call the clinic for hours</p>
                  )}
                </Fact>
                <Fact icon={ShieldCheck} label="Insurance">
                  <ul className="space-y-1.5">
                    {insuranceRows.map(([label, yes]) => (
                      <li key={label} className="flex items-center gap-2">
                        {yes ? <Check className="h-4 w-4 text-[#024E44]" aria-hidden="true" /> : <Minus className="h-4 w-4 opacity-35" aria-hidden="true" />}
                        <span className={yes ? '' : 'opacity-60'}>{label}</span>
                        <span className="sr-only">{yes ? 'accepted' : yes === false ? 'not accepted' : 'not confirmed'}</span>
                      </li>
                    ))}
                  </ul>
                  {networks.length > 0 && <p className="mt-2 text-xs opacity-70">{networks.join(' · ')}</p>}
                  <p className="mt-2 text-xs opacity-55">Confirm your plan with the clinic.</p>
                </Fact>
              </div>
            </div>
            {!c.is_claimed && (
              <Link href={`/claim/${c.id}`} className={`mt-2 flex items-center justify-between gap-3 rounded-xl bg-[#0D1F1C] p-5 text-sm font-bold text-white md:rounded-2xl ${focusRing}`}>
                Is this your clinic? Claim it, free
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            )}
          </aside>
        </div>

        {/* ================= 4. Similar ================= */}
        {similar.length > 0 && (
          <section className={`${wrap} mt-16 pb-2 md:mt-24`} aria-labelledby="cl-similar">
            <div className="mb-5 flex items-end justify-between gap-4">
              <h2 id="cl-similar" className="text-2xl font-bold tracking-tight md:text-3xl">Similar clinics</h2>
              <Link href={`${DIRECTORY}${c.specialty ? `?specialty=${encodeURIComponent(c.specialty)}` : ''}`} className="text-sm font-semibold underline underline-offset-4">
                See all
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
    </div>
  );
}
