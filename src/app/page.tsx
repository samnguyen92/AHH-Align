import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, MapPin, Star } from 'lucide-react';
import { ArticleImage } from '@/components/insights/article-image';
import { getPublishedArticles } from '@/services/article-service';
import { searchClinics } from '@/services/clinic-service';
import type { Article, Clinic } from '@/types/database';

const HERO_IMAGE = '/brand/home-hero-care-team.png';

const STATS = [
  {
    value: '10',
    label: 'Top Asian Population Metros',
    detail: 'Coast to coast coverage',
    className: 'bg-[var(--ahh-lime)] text-[var(--ahh-ink)]',
  },
  {
    value: '9',
    label: 'Medical Specialties',
    detail: 'Covered in the directory',
    className: 'bg-[var(--ahh-soft-yellow)] text-[var(--ahh-ink)]',
  },
  {
    value: '+2',
    label: 'Language Support',
    detail: '🇻🇳 Vietnamese · 🇰🇷 Korean',
    className: 'bg-[var(--ahh-blush-pink)] text-[var(--ahh-ink)]',
  },
  {
    value: '100%',
    label: 'Free for Patients',
    detail: 'Always, forever',
    className: 'bg-[var(--ahh-sage-dark)] text-white',
  },
] as const;

const SPECIALTIES = [
  { emoji: '🩺', name: 'Primary Care', href: '/search?specialty=Primary%20Care', active: true },
  { emoji: '🦷', name: 'Dental', href: '/search?specialty=Dentistry' },
  { emoji: '🧠', name: 'Mental Health', href: '/search?specialty=Psychiatry' },
  { emoji: '👶', name: 'OB/GYN', href: '/search?specialty=OB%2FGYN' },
  { emoji: '👁️', name: 'Eye Care', href: '/search?specialty=Ophthalmology' },
  { emoji: '❤️', name: 'Cardiology', href: '/search?specialty=Cardiology' },
  { emoji: '🧪', name: 'Dermatology', href: '/search?specialty=Dermatology' },
  { emoji: '🦴', name: 'Orthopedics', href: '/search?specialty=Orthopedics' },
  { emoji: '💊', name: 'Pediatrics', href: '/search?specialty=Pediatrics' },
] as const;

const CITIES = [
  {
    name: 'New York, NY',
    count: '2,100+',
    href: '/search?city=New%20York',
    image: 'https://images.unsplash.com/photo-1499092346589-b9b6be3e94b2?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Los Angeles, CA',
    count: '1,800+',
    href: '/search?city=Los%20Angeles',
    image: 'https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'San Jose, CA',
    count: '720+',
    href: '/search?city=San%20Jose',
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Houston, TX',
    count: '690+',
    href: '/search?city=Houston',
    image: 'https://images.unsplash.com/photo-1530089711124-9ca31fb9e863?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Seattle, WA',
    count: '620+',
    href: '/search?city=Seattle',
    image: 'https://images.unsplash.com/photo-1502175353174-a7a70e73b362?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Dallas, TX',
    count: '510+',
    href: '/search?city=Dallas',
    image: 'https://images.unsplash.com/photo-1531218150217-54595bc2b934?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Atlanta, GA',
    count: '430+',
    href: '/search?city=Atlanta',
    image: 'https://images.unsplash.com/photo-1575917649705-5b59aaa12e6b?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Chicago, IL',
    count: '390+',
    href: '/search?city=Chicago',
    image: 'https://images.unsplash.com/photo-1494522358652-f30e61a60313?auto=format&fit=crop&w=700&q=80',
  },
] as const;

const TRUST_BLOCKS = [
  { title: 'Built for Asian Communities', tone: 'bg-[var(--ahh-soft-yellow)]' },
  { title: 'Search What Matters', tone: 'bg-[var(--ahh-blush-pink)]' },
  { title: 'Clinic Claim & Profiles', tone: 'bg-[var(--ahh-lime)]' },
  { title: 'Patient Orientation', tone: 'bg-[var(--ahh-sage-green)]' },
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
    image: null,
  },
  {
    title: 'Preparing for a Visit With a New Doctor',
    category: 'Visit Prep',
    slug: 'preparing-for-a-visit-with-a-new-doctor',
    excerpt: 'What to bring, what to ask, and how to involve family.',
    image: null,
  },
  {
    title: 'What to Ask Before Booking Care Online',
    category: 'Healthcare Access',
    slug: 'what-to-ask-before-booking-care-online',
    excerpt: 'Questions about insurance, language support, and follow-up care.',
    image: null,
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

function SectionHeader({
  title,
  description,
  href,
}: {
  title: string;
  description?: string;
  href?: string;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--ahh-ink)]">{title}</h2>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ahh-muted)]">{description}</p>
        )}
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-xs font-bold text-[var(--ahh-deep-teal)] hover:underline">
          View all
        </Link>
      )}
    </div>
  );
}

function SearchBar({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/search" className={compact ? 'w-full' : 'relative z-20 w-full'}>
      <div className="flex flex-col gap-2 rounded-[var(--ahh-radius-sm)] border border-[var(--ahh-border)] bg-white p-2 shadow-[0_18px_50px_rgba(0,92,75,0.18)] sm:flex-row sm:items-center">
        <div className="flex min-h-11 flex-1 items-center gap-2 px-3">
          <input
            name="query"
            placeholder="Specialty (e.g. Primary Care)"
            className="w-full bg-transparent text-sm text-[var(--ahh-ink)] outline-none placeholder:text-[var(--ahh-muted-2)]"
          />
        </div>
        <div className="hidden h-6 w-px bg-[var(--ahh-border)] sm:block" />
        <input
          name="city"
          placeholder="City"
          className="min-h-11 w-full rounded-md bg-transparent px-3 text-sm outline-none placeholder:text-[var(--ahh-muted)] sm:w-32"
        />
        <div className="hidden h-6 w-px bg-[var(--ahh-border)] sm:block" />
        <input
          name="language"
          placeholder="Language"
          className="min-h-11 w-full rounded-md bg-transparent px-3 text-sm outline-none placeholder:text-[var(--ahh-muted)] sm:w-36"
        />
        <button className="brand-button-secondary min-h-11 px-6" type="submit">
          Search
        </button>
      </div>
    </form>
  );
}

export default async function HomePage() {
  const [publishedArticles, clinicResult] = await Promise.all([
    getPublishedArticles(undefined, 1, 3),
    searchClinics({ limit: 4 }),
  ]);

  const insightCards =
    publishedArticles.data.length > 0
      ? publishedArticles.data.map(toHomeInsightCard)
      : FALLBACK_ARTICLES;
  const clinics = clinicResult.data.length > 0 ? clinicResult.data.slice(0, 4) : FALLBACK_CLINICS;

  return (
    <div className="bg-[#92C7AD] p-1 sm:p-2">
      <div className="home-shell">
      <section className="home-hero">
        <div className="home-hero-grid">
          <div className="home-hero-copy">
            <h1 className="max-w-2xl text-4xl font-normal leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Find a Health Clinic That Speaks Your Language
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-white/72 sm:text-base">
              Asian Health Hub connects Vietnamese and Korean-speaking patients with trusted clinics across
              the United States. Search by specialty, city, or language and get care you truly understand.
            </p>
            <div className="home-hero-search">
              <SearchBar />
            </div>
          </div>

          <div className="home-hero-media">
            <Image
              src={HERO_IMAGE}
              alt="Asian doctor, patient, and family caregiver"
              width={1024}
              height={1024}
              priority
              className="home-hero-image"
            />
          </div>
        </div>
      </section>

      <section className="home-stats-grid">
        {STATS.map((stat) => (
          <div key={stat.label} className={`${stat.className} min-h-32 rounded-[var(--ahh-radius)] p-5`}>
            <div className="text-4xl font-semibold leading-none">{stat.value}</div>
            <p className="mt-3 text-sm font-bold">{stat.label}</p>
            <p className="mt-1 text-xs leading-5 opacity-70">{stat.detail}</p>
          </div>
        ))}
      </section>

      <section className="mt-1 rounded-[var(--ahh-radius)] bg-white px-6 py-14 sm:px-10 lg:px-16">
        <SectionHeader
          title="Top Trusted Care Near You"
          description="Find high-quality Asian health clinics with language support, reviews, and practical profile details."
          href="/search"
        />
        <div className="home-card-grid home-card-grid-four">
          {clinics.map((clinic, index) => (
            <Link key={clinic.id} href={`/clinics/${clinic.slug}`} className="brand-card group overflow-hidden">
              <ArticleImage
                src={clinicImage(clinic, index)}
                alt={clinic.name}
                className="aspect-[4/3] w-full"
                iconSize={46}
              />
              <div className="space-y-3 p-4">
                <h3 className="line-clamp-2 text-sm font-bold leading-5 text-[var(--ahh-ink)]">
                  {clinic.name}
                </h3>
                <div className="flex items-center gap-1 text-xs text-[var(--ahh-muted)]">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {clinicRating(clinic)}
                  <span className="mx-1">•</span>
                  {clinic.specialty || 'Clinic'}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-[var(--ahh-muted)]">
                    <MapPin className="h-3 w-3 text-[var(--ahh-deep-teal)]" />
                    {clinic.city || 'Near you'}
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-[var(--ahh-deep-teal)]">
                    View <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-1 rounded-[var(--ahh-radius)] bg-[var(--ahh-mist-2)] px-6 py-14 sm:px-10 lg:px-16">
        <SectionHeader
          title="Top-searched specialties"
          description="Jump into care categories Asian families commonly search for."
          href="/search"
        />
        <div className="home-specialty-grid">
          {SPECIALTIES.map((specialty) => (
            <Link
              key={specialty.name}
              href={specialty.href}
              className={[
                'group flex min-h-24 flex-col items-center justify-center rounded-[var(--ahh-radius-sm)] border border-[var(--ahh-border)] px-2 text-center text-xs font-bold transition hover:-translate-y-0.5 hover:shadow-sm',
                'active' in specialty && specialty.active
                  ? 'bg-[var(--ahh-deep-teal)] text-white'
                  : 'bg-white text-[var(--ahh-ink)]',
              ].join(' ')}
            >
              <span className="text-xl">{specialty.emoji}</span>
              <span className="mt-2 line-clamp-2">{specialty.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-1 rounded-[var(--ahh-radius)] bg-white px-6 py-14 sm:px-10 lg:px-16">
        <SectionHeader
          title="Find Clinics in Your City"
          description="Browse clinics in major US cities with large Asian American communities."
          href="/search"
        />
        <div className="home-city-grid">
          {CITIES.map((city) => (
            <Link
              key={city.name}
              href={city.href}
              className="group relative aspect-[1.2/1] overflow-hidden rounded-[var(--ahh-radius)] bg-[var(--ahh-mist)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={city.image}
                alt={city.name}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute inset-x-3 bottom-3 text-white">
                <p className="text-sm font-bold">{city.name}</p>
                <p className="text-xs text-white/72">{city.count} clinics</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-1 rounded-[var(--ahh-radius)] bg-[var(--ahh-mist-2)] px-6 py-16 sm:px-10 lg:px-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <h2 className="max-w-md text-3xl font-semibold leading-tight text-[var(--ahh-ink)]">
              Healthcare is personal. Language shouldn&apos;t be a barrier.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-[var(--ahh-muted)]">
              We make it easier to find clinics that understand culture, family decision-making,
              insurance questions, and the comfort of speaking in your own language.
            </p>
            <Link href="/search" className="brand-button-secondary mt-6">
              Find a clinic
            </Link>
          </div>
          <div className="space-y-2">
            {TRUST_BLOCKS.map((block, index) => (
              <div key={block.title} className={`${block.tone} rounded-[var(--ahh-radius-sm)] p-5`}>
                <p className="text-sm font-bold text-[var(--ahh-ink)]">{block.title}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ahh-ink)]/65">
                  {index === 0
                    ? 'Browse clinics with language, specialty, and community context.'
                    : 'Profiles are designed to answer practical questions before you book.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-1 rounded-[var(--ahh-radius)] bg-white px-6 py-16 sm:px-10 lg:px-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-semibold text-[var(--ahh-ink)]">What Patients Are Saying</h2>
          <p className="mt-2 text-sm text-[var(--ahh-muted)]">
            Real reasons families look for culturally informed care.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <div key={testimonial.name} className="rounded-[var(--ahh-radius)] bg-[var(--ahh-mist-2)] p-6">
              <div className="mb-4 flex gap-0.5 text-[var(--ahh-deep-teal)]">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} className="h-3 w-3 fill-current" />
                ))}
              </div>
              <p className="text-sm leading-7 text-[var(--ahh-ink)]">&ldquo;{testimonial.quote}&rdquo;</p>
              <p className="mt-5 text-xs font-bold text-[var(--ahh-deep-teal)]">{testimonial.name}</p>
              <p className="text-xs text-[var(--ahh-muted)]">{testimonial.location}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-1 rounded-[var(--ahh-radius)] bg-[var(--ahh-deep-teal)] px-6 py-12 text-white sm:px-10 lg:px-16">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Are You a Clinic Serving the Asian Community?</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/70">
              Claim your profile, keep clinic information accurate, and help patients find care they can understand.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/claim" className="brand-button">
              Claim Your Profile
            </Link>
            <Link href="/about" className="brand-button-ghost border-white/25 bg-transparent text-white hover:bg-white hover:text-[var(--ahh-deep-teal)]">
              Learn More
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-1 rounded-[var(--ahh-radius)] bg-[var(--ahh-mist-2)] px-6 py-14 sm:px-10 lg:px-16">
        <SectionHeader
          title="Health Insights & Guide for Patients"
          description="Actionable articles to help you understand access, prevention, insurance, and language support."
          href="/insights"
        />
        <div className="grid gap-5 md:grid-cols-3">
          {insightCards.map((article) => (
            <Link key={article.slug} href={`/insights/${article.slug}`} className="brand-card group overflow-hidden">
              <ArticleImage src={article.image} alt={article.title} className="aspect-[16/9] w-full" />
              <div className="p-4">
                <span className="brand-chip">{article.category}</span>
                <h3 className="mt-4 line-clamp-2 text-sm font-bold leading-5 text-[var(--ahh-ink)]">
                  {article.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--ahh-muted)]">{article.excerpt}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[var(--ahh-deep-teal)]">
                  Read <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
