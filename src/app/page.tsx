import Link from 'next/link';
import { ArrowRight, MapPin, Star } from 'lucide-react';
import { ArticleImage } from '@/components/insights/article-image';
import { getPublishedArticles } from '@/services/article-service';
import { SAMPLE_NEXT_HEALTH_CLINIC, searchClinics } from '@/services/clinic-service';
import type { Article, Clinic } from '@/types/database';
import { HomeQuiz } from '@/components/home/home-quiz';
import { CountUp, ParallaxImage, Rail, Reveal, SplitTitle } from '@/components/lg/motion';

const HERO_IMAGE = '/brand/lg/hero.jpg';

const ARROW = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

/** Specialties shown in the rail and counted live for the quiz. */
const GOALS = [
  { title: ['Find a', 'primary doctor'], specialty: 'Primary Care', image: '/brand/lg/primary-care.jpg', pos: '50% 40%' },
  { title: ['Care for', 'the whole family'], specialty: 'Pediatrics', image: '/brand/lg/family.jpg', pos: '50% 50%' },
  { title: ['Dental', 'care'], specialty: 'Dental', image: '/brand/about/step-search-directory.webp', pos: '50% 50%' },
  { title: ['Mental', 'health'], specialty: 'Mental Health', image: '/brand/about/mission-family-care.webp', pos: '50% 40%' },
  { title: ["Women's", 'health'], specialty: 'OB/GYN', image: '/brand/about/step-contact-clinic.webp', pos: '50% 40%' },
  { title: ['Heart', 'health'], specialty: 'Cardiology', image: '/brand/about/hero-language-care.webp', pos: '60% 40%' },
] as const;

const QUIZ_SPECIALTIES = ['Primary Care', 'Dental', 'Mental Health', 'OB/GYN', 'Cardiology', 'Ophthalmology', 'Dermatology', 'Pediatrics', 'Orthopedics'] as const;
const QUIZ_LANGUAGES = ['Vietnamese', 'Korean', 'Chinese'] as const;

const TILES = [
  { big: true, title: ['Speak freely,', 'in Vietnamese'], image: '/brand/lg/hero.jpg', pos: '30% 50%', fact: 'Clinics with Vietnamese-speaking staff', href: '/search?language=Vietnamese' },
  { big: true, title: ['Care in Korean,', 'for the family'], image: '/brand/lg/family.jpg', pos: '50% 40%', fact: 'Clinics with Korean-speaking staff', href: '/search?language=Korean' },
  { title: ['Chinese-speaking', 'clinics'], fact: 'Mandarin and Cantonese', href: '/search?language=Chinese' },
  { title: ['Telehealth', 'visits'], fact: 'Care from home', href: '/search' },
  { title: ['Find a clinic', 'in your city'], fact: '10 metro areas', href: '/search' },
  { title: ['Claim your', 'clinic profile'], fact: 'Free for clinics', href: '/claim' },
] as const;

const CITIES = [
  {
    name: 'Los Angeles, CA',
    count: '30',
    href: '/search?city=Los%20Angeles',
    image: 'https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Houston, TX',
    count: '24',
    href: '/search?city=Houston',
    image: 'https://images.unsplash.com/photo-1530089711124-9ca31fb9e863?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'San Jose, CA',
    count: '18',
    href: '/search?city=San%20Jose',
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Dallas, TX',
    count: '22',
    href: '/search?city=Dallas',
    image: 'https://images.unsplash.com/photo-1531218150217-54595bc2b934?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'San Francisco, CA',
    count: '28',
    href: '/search?city=San%20Francisco',
    image: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Seattle, WA',
    count: '16',
    href: '/search?city=Seattle',
    image: 'https://images.unsplash.com/photo-1502175353174-a7a70e73b362?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Washington, D.C.',
    count: '14',
    href: '/search?city=Washington',
    image: 'https://images.unsplash.com/photo-1501446529957-6226bd447c46?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'San Diego, CA',
    count: '20',
    href: '/search?city=San%20Diego',
    image: '/brand/cities/san-diego.png',
  },
  {
    name: 'Atlanta, GA',
    count: '12',
    href: '/search?city=Atlanta',
    image: 'https://images.unsplash.com/photo-1575917649705-5b59aaa12e6b?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Sacramento, CA',
    count: '15',
    href: '/search?city=Sacramento',
    image: '/brand/cities/sacramento.png',
  },
] as const;

const TESTIMONIALS = [
  {
    quote:
      'I wanted a clinic where my mom could explain symptoms in Vietnamese. Finding care felt less stressful when language was part of the search.',
    name: 'Mai T.',
    location: 'San Jose, CA',
  },
  {
    quote:
      'The directory made it easier to compare clinics and understand who actually supports Korean-speaking families.',
    name: 'Joon K.',
    location: 'Los Angeles, CA',
  },
  {
    quote:
      'I used to call three offices just to ask about language support. This made the first step much clearer.',
    name: 'Linh P.',
    location: 'Houston, TX',
  },
] as const;

const FALLBACK_CLINICS: Clinic[] = [
  SAMPLE_NEXT_HEALTH_CLINIC,
  {
    id: 'fallback-vn-wellness',
    org_id: null,
    name: 'VN Wellness Medical Group',
    slug: 'vn-wellness-medical-group',
    description: 'Culturally informed care for Vietnamese families.',
    address: null,
    city: 'Los Angeles',
    state: 'CA',
    zip_code: null,
    phone: null,
    languages: ['Vietnamese', 'English'],
    specialty: 'Primary Care',
    is_telehealth_available: true,
    claimed_by: null,
    is_claimed: false,
    metadata: { rating: 4.8, images: [] },
    created_at: '',
  },
] as Clinic[];

const FALLBACK_ARTICLES = [
  {
    title: 'How to Find a Clinic That Speaks Your Language',
    category: 'Patient Guide',
    slug: 'find-clinic-that-speaks-your-language',
    excerpt: 'Simple steps to compare language access, reviews, and care fit.',
    image: '/brand/pulse/insight-healthcare-guide.webp',
  },
  {
    title: 'Preparing for a Visit With a New Doctor',
    category: 'Visit Prep',
    slug: 'preparing-for-a-visit-with-a-new-doctor',
    excerpt: 'What to bring, what to ask, and how to involve family.',
    image: '/brand/pulse/insight-clinic-questions.webp',
  },
  {
    title: 'What to Ask Before Booking Care Online',
    category: 'Healthcare Access',
    slug: 'what-to-ask-before-booking-care-online',
    excerpt: 'Questions about insurance, language support, and follow-up care.',
    image: '/brand/pulse/insight-vietnamese-doctor.webp',
  },
] as const;

type HomeInsightCard = {
  title: string;
  category: string;
  slug: string;
  excerpt: string;
  image?: string | null;
};

function toHomeInsightCard(article: Article): HomeInsightCard {
  return {
    title: article.title,
    category: article.category || article.seo_meta.content_mode || 'Insight',
    slug: article.slug,
    excerpt: article.excerpt || 'Practical healthcare guidance for Asian American patients and families.',
    image: article.seo_meta.og_image || article.seo_meta.images?.[0] || null,
  };
}

function clinicImage(clinic: Clinic, index: number) {
  return clinic.metadata?.images?.[0] || CITIES[index % CITIES.length].image;
}

function clinicRating(clinic: Clinic) {
  const rating = clinic.metadata?.rating;
  return typeof rating === 'number' && Number.isFinite(rating) ? rating.toFixed(1) : '4.8';
}

export default async function HomePage() {
  const [publishedArticles, clinicResult, ...counts] = await Promise.all([
    getPublishedArticles(undefined, 1, 3, 'pulse'),
    searchClinics({ limit: 4 }),
    ...CITIES.map((city) => searchClinics({ city: city.name.split(',')[0].trim(), limit: 1 })),
    ...QUIZ_SPECIALTIES.map((specialty) => searchClinics({ specialty, limit: 1 })),
    ...QUIZ_LANGUAGES.map((language) => searchClinics({ language, limit: 1 })),
  ]);

  const cityCounts = counts.slice(0, CITIES.length);
  const specialtyCounts = counts.slice(CITIES.length, CITIES.length + QUIZ_SPECIALTIES.length);
  const languageCounts = counts.slice(CITIES.length + QUIZ_SPECIALTIES.length);

  const quizCounts = {
    specialties: Object.fromEntries(QUIZ_SPECIALTIES.map((s, i) => [s, specialtyCounts[i]?.total ?? 0])),
    languages: Object.fromEntries(QUIZ_LANGUAGES.map((l, i) => [l, languageCounts[i]?.total ?? 0])),
  };

  const insightCards =
    publishedArticles.data.length > 0 ? publishedArticles.data.map(toHomeInsightCard) : FALLBACK_ARTICLES;
  const clinics = clinicResult.data.length > 0 ? clinicResult.data.slice(0, 4) : FALLBACK_CLINICS;
  const totalClinics = clinicResult.total;

  const citiesWithCounts = CITIES.map((city, index) => ({
    ...city,
    count: String(cityCounts[index]?.total ?? 0),
  }));

  const points = [
    {
      k: <><b>{QUIZ_LANGUAGES.length}</b> languages</>,
      title: 'Search by the language you trust',
      text: 'Vietnamese, Korean and Chinese-speaking care, listed clearly.',
      image: '/brand/lg/hero.jpg',
      alt: 'A grandmother, her daughter and a doctor laughing together in a clinic hallway',
      href: '/search',
    },
    {
      k: <><b>{totalClinics || 'Growing'}</b> {totalClinics ? 'clinics' : 'directory'}</>,
      title: 'Clinics worth your time',
      text: 'Ratings, services, hours and what patients say, in one profile.',
      image: '/brand/lg/primary-care.jpg',
      alt: 'A doctor smiles across the desk from a patient',
      href: '/search',
    },
    {
      k: <><b>0</b> cost to you</>,
      title: 'Free for patients, always',
      text: 'Find a clinic, read the profile and book on the clinic’s own site.',
      image: '/brand/lg/family.jpg',
      alt: 'A multigenerational family walks out of a clinic together',
      href: '/about',
    },
  ];

  return (
    <div className="lg">
      {/* ===== Hero: ambient photo (E) + live quiz (F) ===== */}
      <section className="lg-hero">
        <div className="lg-hero-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HERO_IMAGE} alt="" aria-hidden="true" fetchPriority="high" />
        </div>
        <div className="lg-wrap">
          <div className="lg-hero-grid">
            <div>
              <SplitTitle className="lg-title" text="Find a Health Clinic That Speaks Your Language" tintFrom={4} />
              <p className="lg-lede">
                Asian Health Hub connects Vietnamese, Korean and Chinese-speaking patients with trusted clinics across
                the United States. Search by specialty, city or language.
              </p>
              {totalClinics > 0 && (
                <div className="lg-counter" aria-label={`${totalClinics} clinics listed`}>
                  <i aria-hidden="true" />
                  <CountUp to={totalClinics} />
                  <span>clinics listed,<br />free for every patient</span>
                </div>
              )}
            </div>
            <HomeQuiz counts={quizCounts} />
          </div>
        </div>
      </section>

      {/* ===== Intro: sticky claim + three answers (E) ===== */}
      <section className="lg-intro">
        <div className="lg-wrap">
          <div className="grid">
            <div className="lg-claim">
              <Reveal as="span" className="lg-eyebrow">Why Asian Health Hub</Reveal>
              <Reveal as="h2" delay={0.05}>
                Healthcare is personal. Language shouldn’t be a barrier, so we help you <em>choose with confidence.</em>
              </Reveal>
              <Reveal delay={0.1}>
                <Link href="/about" className="lg-link">How the directory works {ARROW}</Link>
              </Reveal>
            </div>
            <div className="lg-points">
              {points.map((p, i) => (
                <Reveal key={p.title} delay={0.05 + i * 0.07}>
                  <Link className="lg-point" href={p.href}>
                    <span className="ph">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt={p.alt} loading="lazy" />
                    </span>
                    <div>
                      <span className="k">{p.k}</span>
                      <h3>{p.title}</h3>
                      <p>{p.text}</p>
                    </div>
                    <span className="go" aria-hidden="true">{ARROW}</span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Goals rail (E) ===== */}
      <section className="lg-goals">
        <div className="lg-wrap">
          <Rail title="What care are you looking for?">
            {GOALS.map((goal) => {
              const n = quizCounts.specialties[goal.specialty];
              return (
                <Link key={goal.specialty} className="lg-goal" href={`/search?specialty=${encodeURIComponent(goal.specialty)}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={goal.image} alt="" loading="lazy" style={{ objectPosition: goal.pos }} />
                  <div className="lab">
                    <div>
                      <h3>{goal.title[0]}<br />{goal.title[1]}</h3>
                      <span className="fact">{n ? `${n} clinics listed` : 'Browse the directory'}</span>
                    </div>
                    <span className="go" aria-hidden="true">{ARROW}</span>
                  </div>
                </Link>
              );
            })}
          </Rail>
        </div>
      </section>

      {/* ===== Top clinics ===== */}
      <section className="lg-clinics">
        <div className="lg-wrap">
          <div className="lg-head">
            <Reveal as="h2">Top trusted care near you</Reveal>
            <Reveal><Link href="/search" className="lg-link">View all {ARROW}</Link></Reveal>
          </div>
          <div className="lg-cgrid">
            {clinics.map((clinic, index) => (
              <Reveal key={clinic.id} delay={index * 0.06} className="lg-fill">
                <Link href={`/clinics/${clinic.slug}`} className="lg-ccard">
                  <div className="ph">
                    <ArticleImage src={clinicImage(clinic, index)} alt={clinic.name} className="aspect-[4/3] w-full" iconSize={46} />
                  </div>
                  <div className="bd">
                    <h3>{clinic.name}</h3>
                    <div className="meta">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {clinicRating(clinic)}
                      <span>·</span>
                      {clinic.specialty || 'Clinic'}
                    </div>
                    <div className="foot">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{clinic.city || 'Near you'}</span>
                      <b>View <ArrowRight className="h-3.5 w-3.5" /></b>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Start from what you want: asymmetric tiles (F) ===== */}
      <section className="lg-tiles">
        <div className="lg-wrap">
          <Reveal as="h2" className="lg-h2">Start from what you need</Reveal>
          <div className="grid">
            {TILES.map((tile, i) => (
              <Reveal key={tile.href + i} delay={(i % 3) * 0.07} className={`lg-fill ${'big' in tile && tile.big ? 'lg-span2' : ''}`}>
                <Link className={`lg-tile ${'big' in tile && tile.big ? 'big' : ''}`} href={tile.href}>
                  {'image' in tile && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tile.image} alt="" loading="lazy" style={{ objectPosition: tile.pos }} />
                  )}
                  <h3>{tile.title[0]}<br /><em>{tile.title[1]}</em></h3>
                  <div className="row"><span>{tile.fact}</span>{ARROW}</div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Night: stats (F) ===== */}
      <section className="lg-night">
        <div className="lg-wrap">
          <div className="grid">
            <div>
              <Reveal as="h2">Every clinic listed. <em>Every language clear.</em></Reveal>
              <Reveal as="p" delay={0.08}>
                We list the languages each clinic supports, the specialties it offers and where to find it, so families
                can decide together without guesswork.
              </Reveal>
            </div>
            <div className="lg-stats">
              {[
                { to: totalClinics || 10, label: totalClinics ? 'clinics in the directory' : 'top Asian population metros' },
                { to: CITIES.length, label: 'top Asian population metros' },
                { to: QUIZ_SPECIALTIES.length, label: 'medical specialties' },
                { to: QUIZ_LANGUAGES.length, label: 'languages supported' },
              ].map((stat, i) => (
                <Reveal key={stat.label + i} className="lg-stat" delay={i * 0.06}>
                  <CountUp to={stat.to} />
                  <span>{stat.label}</span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Cities ===== */}
      <section className="lg-section">
        <div className="lg-wrap">
          <div className="lg-head">
            <div>
              <Reveal as="h2">Find clinics in your city</Reveal>
            </div>
            <Reveal><Link href="/search" className="lg-link">View all {ARROW}</Link></Reveal>
          </div>
          <div className="lg-cities">
            {citiesWithCounts.map((city, i) => (
              <Reveal key={city.name} delay={(i % 5) * 0.05} className="lg-fill">
                <Link href={city.href} className="lg-city">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={city.image} alt="" loading="lazy" />
                  <div>
                    <h3>{city.name}</h3>
                    <span>{city.count} clinics</span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Proof (F) ===== */}
      <section className="lg-proof">
        <div className="lg-wrap">
          <div className="grid">
            <Reveal as="figure">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/lg/primary-care.jpg" alt="A doctor listens as a patient explains her symptoms" loading="lazy" />
            </Reveal>
            <div>
              <Reveal as="h2" className="lg-h2">Everything you’d want to know before you book</Reveal>
              <ul>
                <Reveal as="li" delay={0.05}>Languages spoken, specialties and services, listed clearly</Reveal>
                <Reveal as="li" delay={0.1}>Ratings, hours and insurance in one profile</Reveal>
                <Reveal as="li" delay={0.15}>Book with the clinic directly, never through a paywall</Reveal>
              </ul>
              <Reveal delay={0.2}>
                <Link href="/search" className="lg-cta lg-cta--green">Find clinics near me {ARROW}</Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Insights ===== */}
      <section className="lg-section">
        <div className="lg-wrap">
          <div className="lg-head">
            <Reveal as="h2">Health insights &amp; guides for patients</Reveal>
            <Reveal><Link href="/insights" className="lg-link">View all {ARROW}</Link></Reveal>
          </div>
          <div className="lg-cards">
            {insightCards.map((article, i) => (
              <Reveal key={article.slug} delay={i * 0.07} className="lg-fill">
                <Link href={`/insights/${article.slug}`} className="lg-card">
                  <div className="ph">
                    <ArticleImage src={article.image} alt={article.title} className="aspect-[16/10] w-full" />
                  </div>
                  <div className="bd">
                    <span className="k">{article.category}</span>
                    <h3>{article.title}</h3>
                    <p className="line-clamp-2">{article.excerpt}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Quotes ===== */}
      <section className="lg-section lg-section--band">
        <div className="lg-wrap">
          <div className="lg-head">
            <Reveal as="h2">What patients are saying</Reveal>
          </div>
          <div className="lg-quotes">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 0.07} className="lg-quote">
                <p>“{t.quote}”</p>
                <footer><b>{t.name}</b> · {t.location}</footer>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Film CTA with parallax (E) ===== */}
      <section className="lg-film">
        <div className="lg-wrap">
          <div className="lg-panel">
            <ParallaxImage src="/brand/lg/family.jpg" alt="A family walks out of a clinic together" />
            <div className="copy">
              <Reveal as="h2">Help patients find your clinic in the language they trust.</Reveal>
              <Reveal as="p" delay={0.08}>
                Claim your profile, keep clinic information accurate, and help patients find care they can understand.
              </Reveal>
              <Reveal delay={0.16} className="flex flex-wrap gap-3">
                <Link href="/claim" className="lg-cta lg-cta--lime">Claim your profile {ARROW}</Link>
                <Link href="/about" className="lg-cta lg-cta--line">Learn more</Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
