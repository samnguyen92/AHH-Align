import Link from 'next/link';
import { HeroSearch } from '@/components/home/hero-search';
import { ArticleImage } from '@/components/insights/article-image';
import { BrandLogo } from '@/components/layout/brand-logo';
import { getPublishedArticles } from '@/services/article-service';
import type { Article } from '@/types/database';

const STATS = [
  { value: '12,000+', label: 'Community Members' },
  { value: '340+', label: 'Trusted Clinics' },
  { value: '8', label: 'Specialties' },
] as const;

const SPECIALTIES = [
  { emoji: '🩺', tone: 'bg-[var(--ahh-lime)]', name: 'Primary Care', count: 240 },
  { emoji: '🦷', tone: 'bg-[var(--ahh-soft-yellow)]', name: 'Dentistry', count: 185 },
  { emoji: '👁️', tone: 'bg-[var(--ahh-sage-green)]', name: 'Eye Care', count: 92 },
  { emoji: '❤️', tone: 'bg-[var(--ahh-blush-pink)]', name: 'Cardiology', count: 78 },
  { emoji: '🧠', tone: 'bg-white ring-1 ring-[rgba(0,92,75,0.12)]', name: 'Psychiatry', count: 56 },
  { emoji: '🦴', tone: 'bg-[var(--ahh-soft-yellow)]', name: 'Orthopedics', count: 64 },
  { emoji: '👶', tone: 'bg-[var(--ahh-lime)]', name: 'Pediatrics', count: 130 },
  { emoji: '🤰', tone: 'bg-[var(--ahh-sage-green)]', name: 'OB/GYN', count: 95 },
] as const;

const TOP_CITIES = [
  { name: 'Los Angeles, CA', count: 450 },
  { name: 'San Jose, CA', count: 380 },
  { name: 'Houston, TX', count: 320 },
  { name: 'New York, NY', count: 290 },
  { name: 'Seattle, WA', count: 180 },
  { name: 'Chicago, IL', count: 150 },
] as const;

const FALLBACK_GUIDES = [
  {
    title: 'Understanding Your Healthcare Options as a Vietnamese Immigrant',
    category: 'Guide',
    slug: 'healthcare-options-vietnamese',
    excerpt: 'Practical guidance for navigating care, language access, and family decisions.',
    image: null,
  },
  {
    title: "A Parent's Insurance Guide for Vietnamese Families",
    category: 'Insurance',
    slug: 'insurance-guide-vietnamese',
    excerpt: 'Clear steps for understanding coverage, costs, and appointment planning.',
    image: null,
  },
  {
    title: 'How to Book a Wellness Visit in Your Language',
    category: 'Guide',
    slug: 'book-wellness-visit',
    excerpt: 'A simple guide to finding a clinic and preparing for a visit with confidence.',
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

export default async function HomePage() {
  const publishedArticles = await getPublishedArticles(undefined, 1, 3);
  const insightCards =
    publishedArticles.data.length > 0
      ? publishedArticles.data.map(toHomeInsightCard)
      : FALLBACK_GUIDES;

  return (
    <>
      <section className="relative overflow-hidden bg-[var(--ahh-mist)] px-4 py-8 sm:px-6 lg:px-8">
        <div className="brand-hero mx-auto max-w-7xl">
          <div className="relative flex flex-col items-center gap-10 px-7 py-14 sm:px-12 lg:flex-row lg:px-16 lg:py-20">
          <div className="flex-1 text-center lg:text-left">
            <div className="relative z-10 mb-8 flex justify-center lg:justify-start">
              <BrandLogo inverted href="" />
            </div>
            <h1 className="relative z-10 max-w-2xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-[56px]">
              Care that understands your culture.
            </h1>
            <p className="relative z-10 mt-5 max-w-xl text-sm leading-7 text-white/72 sm:text-base">
              Asian Health Hub connects Vietnamese and Korean-speaking patients with trusted clinics across the United States. Search by specialty, city, or language and get care you truly understand.
            </p>
            <div className="relative z-10 mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link href="/search" className="rounded-full bg-[var(--ahh-lime)] px-5 py-3 text-sm font-extrabold text-[var(--ahh-deep-teal)] transition hover:bg-[var(--ahh-soft-yellow)]">
                Find a Practitioner
              </Link>
              <Link href="/insights" className="rounded-full border border-white/25 px-5 py-3 text-sm font-bold text-white transition hover:bg-white hover:text-[var(--ahh-deep-teal)]">
                Learn More
              </Link>
            </div>
          </div>
          <div className="grid w-full max-w-sm gap-3 lg:w-80">
            {['Traditional Medicine', 'Peer Support', 'Health Navigation'].map((item, index) => (
              <div key={item} className="rounded-lg bg-white/10 p-4 text-left text-white backdrop-blur">
                <span className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ahh-lime)] text-xs font-black text-[var(--ahh-deep-teal)]">
                  {index + 1}
                </span>
                <p className="text-sm font-bold">{item}</p>
                <p className="mt-1 text-xs leading-5 text-white/62">Culturally informed care resources and trusted support.</p>
              </div>
            ))}
          </div>
          </div>
          <div className="relative grid divide-y divide-[rgba(0,92,75,0.1)] bg-white text-center sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {STATS.map((stat) => (
              <div key={stat.label} className="px-6 py-5">
                <div className="text-2xl font-semibold text-[var(--ahh-deep-teal)]">{stat.value}</div>
                <div className="mt-1 text-xs text-[var(--ahh-muted)]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative mx-auto mt-6 max-w-4xl px-2">
          <HeroSearch />
        </div>
      </section>

      {/* ===== QUOTE + TOP TRUSTED CLINICS ===== */}
      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="brand-quote mx-auto mb-14 max-w-4xl rounded-lg px-7 py-5">
          <p className="text-lg leading-8 text-[var(--ahh-ink)] sm:text-xl">
            “Healthcare that understands who I am, not just what I have.”
          </p>
          <p className="mt-3 text-xs font-extrabold uppercase text-[var(--ahh-deep-teal)]">Community member, Sydney</p>
        </div>
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-semibold text-[var(--ahh-ink)]">Top Trusted Asian Clinics</h2>
            <Link href="/search" className="text-sm font-bold text-[var(--ahh-deep-teal)] hover:underline">
              View All →
            </Link>
          </div>
          {/* Clinic cards placeholder grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 stagger-children">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="brand-card group overflow-hidden rounded-lg transition-shadow hover:shadow-md">
                <div className="aspect-[4/3] bg-[var(--ahh-mist)]" />
                <div className="p-3">
                  <div className="h-3 w-3/4 bg-gray-100 rounded mb-2" />
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map((s) => (
                      <svg key={s} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={s <= 4 ? '#F59E0B' : 'none'} stroke="#F59E0B" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    ))}
                    <span className="text-xs text-gray-400 ml-1">4.0</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <span className="rounded-full bg-[var(--ahh-lime)] px-2 py-0.5 text-[10px] font-bold text-[var(--ahh-deep-teal)]">Vietnamese</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== EXPLORE SPECIALTIES ===== */}
      <section className="bg-[var(--ahh-mist)] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-10">
            <span className="brand-eyebrow">Wellness</span>
            <h2 className="mt-4 text-3xl font-semibold text-[var(--ahh-ink)]">Explore Featured Specialties</h2>
            <p className="mt-2 text-sm text-[var(--ahh-muted)]">Find clinics by the type of care you need</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 stagger-children">
            {SPECIALTIES.map((spec) => (
              <Link
                key={spec.name}
                href={`/search?specialty=${encodeURIComponent(spec.name)}`}
                className={`${spec.tone} group rounded-lg p-5 text-[var(--ahh-ink)] transition-all hover:-translate-y-0.5 hover:shadow-sm`}
              >
                <div className="mb-6 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/60 text-lg shadow-sm">
                  {spec.emoji}
                </div>
                <div className="text-sm font-bold transition-colors">{spec.name}</div>
                <div className="mt-1 text-xs text-[var(--ahh-ink)]/60">{spec.count}+ clinics</div>
                <span className="mt-4 inline-flex text-xs font-bold">Explore →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FIND CLINICS BY CITY ===== */}
      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-8 text-2xl font-semibold text-[var(--ahh-ink)]">Find Clinics by City</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {TOP_CITIES.map((city) => (
              <Link
                key={city.name}
                href={`/search?city=${encodeURIComponent(city.name.split(',')[0])}`}
                className="brand-card flex items-center justify-between rounded-lg p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ahh-mist)]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-deep-teal)" strokeWidth="1.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span className="text-sm font-semibold text-[var(--ahh-ink)]">{city.name}</span>
                </div>
                <span className="text-xs text-[var(--ahh-muted)]">{city.count}+ clinics</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY IT MATTERS ===== */}
      <section className="bg-[var(--ahh-mist)] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1">
            <h2 className="text-4xl font-semibold leading-tight text-[var(--ahh-ink)]">
              Healthcare in someone&apos;s language shouldn&apos;t be a barrier.
            </h2>
            <p className="mt-4 leading-8 text-[var(--ahh-muted)]">
              Language barriers are one of the biggest reasons Asian Americans avoid seeking healthcare.
              Asian Health Hub was built to change that — connecting patients with providers who speak
              their language and understand their culture.
            </p>
            <div className="mt-6 flex gap-3">
              <Link
                href="/search"
                className="inline-flex items-center rounded-full bg-[var(--ahh-deep-teal)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--ahh-deep-teal-2)]"
              >
                Find a Clinic
              </Link>
              <Link
                href="/insights"
                className="inline-flex items-center rounded-full border border-[rgba(0,92,75,0.16)] bg-white px-5 py-2.5 text-sm font-bold text-[var(--ahh-deep-teal)] transition-colors hover:bg-[var(--ahh-mist)]"
              >
                Learn More
              </Link>
            </div>
          </div>
          {/* Placeholder */}
          <div className="flex h-64 w-full shrink-0 items-center justify-center rounded-lg bg-[var(--ahh-soft-yellow)] lg:w-96">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
          </div>
        </div>
      </section>

      {/* ===== FOR CLINIC OWNERS ===== */}
      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="brand-card mx-auto max-w-4xl rounded-lg px-6 py-10 text-center sm:px-10">
          <h2 className="text-3xl font-semibold text-[var(--ahh-ink)]">Are You a Clinic Owner? Join Asian Health Hub</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--ahh-muted)]">
            Claim your free profile to reach thousands of patients looking for culturally competent care.
            Update your information, respond to reviews, and grow your practice.
          </p>
          <Link
            href="/claim"
            className="mt-6 inline-flex items-center rounded-full bg-[var(--ahh-deep-teal)] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--ahh-deep-teal-2)]"
          >
            Claim Your Free Profile
          </Link>
        </div>
      </section>

      {/* ===== HEALTH INSIGHTS ===== */}
      <section className="bg-[var(--ahh-mist)] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-semibold text-[var(--ahh-ink)]">Health Insights and Guides for Patients</h2>
            <Link href="/insights" className="text-sm font-bold text-[var(--ahh-deep-teal)] hover:underline">
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {insightCards.map((guide) => (
              <Link
                key={guide.slug}
                href={`/insights/${guide.slug}`}
                className="brand-card group overflow-hidden rounded-lg transition-shadow hover:shadow-md"
              >
                <ArticleImage
                  src={guide.image}
                  alt={guide.title}
                  className="aspect-video w-full"
                  iconSize={48}
                />
                <div className="flex min-h-40 flex-col p-4">
                  <span className="rounded-full bg-[var(--ahh-lime)] px-2 py-1 text-[10px] font-extrabold uppercase text-[var(--ahh-deep-teal)]">{guide.category}</span>
                  <h3 className="mt-3 line-clamp-2 text-sm font-bold text-[var(--ahh-ink)] transition-colors group-hover:text-[var(--ahh-deep-teal)]">
                    {guide.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--ahh-muted)]">
                    {guide.excerpt}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
