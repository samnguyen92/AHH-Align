import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Mail, Search, UserRound, Rss } from 'lucide-react';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getArticleBySlug, getPublishedArticles } from '@/services/article-service';

type PulseIssue = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  readTime: string;
  image: string;
  imageAlt: string;
};

const pulseIssues: PulseIssue[] = [
  {
    slug: 'summer-health-tips-asian-families-new-verified-clinics-la',
    title: 'Summer Health Tips for Asian Families + New Verified Clinics in LA',
    excerpt:
      'Summer health reminders, new verified clinics in Los Angeles, and practical search tips for finding language-accessible care.',
    date: 'May 25, 2026',
    author: 'Micah Jenkins',
    readTime: '8 min read',
    image: '/brand/pulse/detail-summer-health-la.webp',
    imageAlt: 'Asian American family reviewing summer health tips and clinic options',
  },
];

const fallbackInsights = [
  {
    title: 'How to Find a Vietnamese-Speaking Doctor Near You',
    slug: 'how-to-find-vietnamese-speaking-doctor-near-you',
    image: '/brand/pulse/insight-vietnamese-doctor.webp',
  },
  {
    title: 'A Simple Healthcare Guide for Vietnamese Patients in the U.S.',
    slug: 'simple-healthcare-guide-vietnamese-patients-us',
    image: '/brand/pulse/insight-healthcare-guide.webp',
  },
  {
    title: 'What to Ask Before Visiting a Vietnamese-Speaking Clinic',
    slug: 'what-to-ask-before-visiting-vietnamese-speaking-clinic',
    image: '/brand/pulse/insight-clinic-questions.webp',
  },
];

function getStaticIssue(slug: string) {
  return pulseIssues.find((issue) => issue.slug === slug);
}

export async function generateStaticParams() {
  const staticSlugs = pulseIssues.map((issue) => ({ slug: issue.slug }));
  try {
    const { data: dbArticles } = await getPublishedArticles('pulse', 1, 100);
    const dbSlugs = (dbArticles || []).map((art) => ({ slug: art.slug }));
    return [...staticSlugs, ...dbSlugs];
  } catch (err) {
    return staticSlugs;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dbArticle = await getArticleBySlug(slug);

  if (dbArticle) {
    const ogImg = (dbArticle.seo_meta as any)?.og_image || '';
    return {
      title: dbArticle.title,
      description: dbArticle.excerpt,
      alternates: {
        canonical: `/pulse/${dbArticle.slug}`,
      },
      openGraph: {
        title: dbArticle.title,
        description: dbArticle.excerpt || '',
        images: ogImg ? [{ url: ogImg }] : [],
      },
    };
  }

  const issue = getStaticIssue(slug);
  if (!issue) {
    return { title: 'Pulse Issue Not Found' };
  }

  return {
    title: issue.title,
    description: issue.excerpt,
    alternates: {
      canonical: `/pulse/${issue.slug}`,
    },
    openGraph: {
      title: issue.title,
      description: issue.excerpt,
      images: [{ url: issue.image }],
    },
  };
}

function DetailImage({
  src,
  alt,
  className = '',
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-[16px] bg-[#E9EEF4] ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 520px"
        className="object-cover"
      />
    </div>
  );
}

const pulseMarkdownComponents = {
  h1: ({ children }: any) => <h2 className="text-[24px] sm:text-[28px] font-bold leading-tight text-[var(--ahh-ink)] mt-10 mb-4 break-words">{children}</h2>,
  h2: ({ children }: any) => <h2 className="text-xl sm:text-2xl font-bold leading-tight text-[var(--ahh-ink)] mt-8 mb-4 break-words">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg sm:text-xl font-bold text-[var(--ahh-ink)] mt-6 mb-3 break-words">{children}</h3>,
  p: ({ children }: any) => <p className="text-[17px] leading-8 text-[var(--ahh-muted)] mb-6">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-6 mb-6 space-y-2 text-[17px] text-[var(--ahh-muted)]">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-6 mb-6 space-y-2 text-[17px] text-[var(--ahh-muted)]">{children}</ol>,
  li: ({ children }: any) => <li>{children}</li>,
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-8 rounded-xl border border-gray-200/60 shadow-3xs max-w-full">
      <table className="min-w-full divide-y divide-gray-200 text-sm text-left">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-gray-50">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>,
  tr: ({ children }: any) => <tr>{children}</tr>,
  th: ({ children }: any) => <th className="px-6 py-3 font-bold text-[var(--ahh-ink)] text-xs uppercase tracking-wider">{children}</th>,
  td: ({ children }: any) => <td className="px-6 py-4 text-[var(--ahh-muted)] text-[13px]">{children}</td>,
  a: ({ href, children }: any) => (
    <a href={href} className="font-semibold text-[var(--ahh-blue)] underline hover:text-[var(--ahh-deep-teal)] transition" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export default async function PulseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  
  // 1. Fetch dynamic article from Supabase
  const dbArticle = await getArticleBySlug(slug);
  const staticIssue = getStaticIssue(slug);

  if (!dbArticle && !staticIssue) {
    notFound();
  }

  // 2. Fetch live Insights & Guides content (3 items)
  const { data: rawLiveArticles } = await getPublishedArticles(undefined, 1, 10);
  const liveArticles = (rawLiveArticles || [])
    .filter((art) => art.category !== 'pulse' && art.slug !== slug)
    .slice(0, 3);

  const displayInsights = liveArticles.length >= 3
    ? liveArticles.map((art) => {
        const ogImg = (art.seo_meta as any)?.og_image || '';
        return {
          title: art.title,
          href: `/insights/${art.slug}`,
          image: ogImg || '/brand/pulse/insight-vietnamese-doctor.webp',
        };
      })
    : fallbackInsights.map((fb) => ({
        title: fb.title,
        href: `/insights/${fb.slug}`,
        image: fb.image,
      }));

  // 3. Compute dynamic Next/Prev pulse links
  const { data: dbPulses } = await getPublishedArticles('pulse', 1, 100);
  const allPulsesUnified = [
    ...(dbPulses || []).map((p) => ({ slug: p.slug, title: p.title })),
    ...pulseIssues.map((p) => ({ slug: p.slug, title: p.title })),
  ];
  
  const uniquePulsesMap = new Map<string, { slug: string; title: string }>();
  for (const p of allPulsesUnified) {
    uniquePulsesMap.set(p.slug, p);
  }
  const finalPulsesList = Array.from(uniquePulsesMap.values());
  
  const currentIndex = finalPulsesList.findIndex((p) => p.slug === slug);
  const nextPulse = currentIndex > 0 ? finalPulsesList[currentIndex - 1] : null;
  const prevPulse = currentIndex !== -1 && currentIndex < finalPulsesList.length - 1 ? finalPulsesList[currentIndex + 1] : null;

  const newsletterAndNavigation = (
    <div className="mx-auto max-w-[860px] mt-12 space-y-12">
      <section className="w-full rounded-[24px] bg-[var(--ahh-deep-teal)] px-6 py-12 text-center text-white sm:px-10 shadow-[0_12px_40px_rgba(2,78,68,0.12)]">
        <div className="flex flex-col items-center justify-center">
          <h2 className="flex items-center gap-3 text-[28px] font-bold leading-tight sm:text-[34px]">
            ✉️ AHH Pulse Newsletter
          </h2>
          <p className="mt-2 text-sm text-white/80">
            Health tips & clinic spotlights for Asian Americans.
          </p>
          
          <form action="/pulse" className="mt-8 flex w-full max-w-[540px] flex-col gap-2 rounded-full sm:flex-row sm:items-center sm:bg-white sm:p-1">
            <div className="flex min-h-12 flex-1 items-center gap-2 rounded-full px-4 sm:px-3 bg-white/10 sm:bg-transparent border border-white/20 sm:border-none">
              <input
                name="email"
                type="email"
                required
                placeholder="Enter Your Email Address"
                className="w-full bg-transparent text-sm text-white sm:text-[var(--ahh-ink)] outline-none placeholder:text-white/60 sm:placeholder:text-[var(--ahh-muted-2)]"
              />
            </div>
            <button type="submit" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white sm:bg-[var(--ahh-deep-teal)] px-6 text-sm font-bold text-[var(--ahh-deep-teal)] sm:text-white transition hover:opacity-90">
              <Rss className="h-4 w-4 shrink-0" />
              Subscribe
            </button>
          </form>
        </div>
      </section>

      <nav className="flex items-center justify-between gap-4 border-t border-gray-100 pt-8 text-sm text-[var(--ahh-muted)] font-medium">
        {prevPulse ? (
          <Link href={`/pulse/${prevPulse.slug}`} className="inline-flex items-center gap-2 transition hover:text-[var(--ahh-blue)]">
            <ArrowLeft className="h-4 w-4" />
            Previous Pulse
          </Link>
        ) : (
          <span className="text-gray-300 cursor-not-allowed inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Previous Pulse
          </span>
        )}

        {nextPulse ? (
          <Link href={`/pulse/${nextPulse.slug}`} className="inline-flex items-center gap-2 transition hover:text-[var(--ahh-blue)]">
            Next Pulse
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="text-gray-300 cursor-not-allowed inline-flex items-center gap-2">
            Next Pulse
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </nav>
    </div>
  );

  const insightsSection = (
    <section className="home-section rounded-[16px] bg-[var(--ahh-mist-2)] px-5 py-16 sm:px-10 lg:px-20 lg:py-[88px]">
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="max-w-4xl text-[36px] font-light leading-tight text-[var(--ahh-ink)] lg:text-[52px]">
            Helpful Insights and Guides from Asian Health Hub
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--ahh-muted)]">
            Want to learn more? Explore related articles and guides that explain healthcare topics in more detail.
          </p>
        </div>
        <Link href="/insights" className="brand-button-ghost w-fit shrink-0 px-5 py-2 text-sm">
          See all Insights
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {displayInsights.map((insight, idx) => (
          <Link key={insight.title + idx} href={insight.href} className="brand-card group overflow-hidden bg-white transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="relative overflow-hidden bg-[#E9EEF4] aspect-[16/10]">
              <Image
                alt={insight.title}
                fill
                sizes="(max-width: 768px) 100vw, 520px"
                src={insight.image}
                className="object-cover"
              />
            </div>
            <div className="p-5">
              <h3 className="line-clamp-2 min-h-[48px] text-base font-bold leading-6 text-[var(--ahh-ink)] group-hover:text-[var(--ahh-blue)]">
                {insight.title}
              </h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );

  if (dbArticle) {
    const rawMonth = (dbArticle.seo_meta as any)?.month_label;
    const monthLabel = rawMonth || (dbArticle.published_at 
      ? new Date(dbArticle.published_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) 
      : 'Recent');
    const imageSrc = (dbArticle.seo_meta as any)?.og_image || '';
    const readTime = '8 min read';
    
    return (
      <div className="bg-[#E5F0EB] px-[10px] pb-[10px]">
        <div className="home-shell">
          <section className="overflow-hidden rounded-[16px] bg-[var(--ahh-blue)] text-white">
            <div className="grid min-h-[600px] items-center gap-10 px-6 pb-16 pt-32 sm:px-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-24 lg:pb-20 lg:pt-40">
              <div className="max-w-4xl">
                <Link href="/pulse" className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/15">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  AHH Pulse
                </Link>
                <h1 className="text-[32px] sm:text-[58px] lg:text-[72px] font-light leading-[1.06] tracking-normal break-words">
                  {dbArticle.title}
                </h1>
                <p className="mt-7 max-w-3xl text-[17px] leading-7 text-white/78">{dbArticle.excerpt}</p>
                <div className="mt-5 flex flex-wrap items-center gap-5 text-xs font-medium text-white/72">
                  <span className="inline-flex items-center gap-2">
                    <Clock3 className="h-4 w-4" />
                    {readTime}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    {monthLabel}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="h-4 w-4" />
                    {dbArticle.author || 'AHH Medical Team'}
                  </span>
                </div>
              </div>

              {imageSrc && (
                <DetailImage
                  src={imageSrc}
                  alt={dbArticle.title}
                  className="min-h-[240px] w-full bg-white/90 lg:min-h-[320px]"
                  priority
                />
              )}
            </div>
          </section>

          <article className="home-section rounded-[16px] bg-white px-5 py-16 sm:px-10 lg:px-20 lg:py-[92px]">
            <div className="mx-auto max-w-[1180px]">
              <div className="mx-auto max-w-[860px] border-b border-gray-100 pb-12">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={pulseMarkdownComponents}>
                  {dbArticle.content}
                </ReactMarkdown>
              </div>

              {newsletterAndNavigation}
            </div>
          </article>

          {insightsSection}

          <section className="home-section rounded-[16px] bg-[var(--ahh-mist-2)] px-5 py-10 sm:px-10 lg:px-20">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[28px] font-medium leading-tight text-[var(--ahh-ink)]">Looking for care now?</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--ahh-muted)]">
                  Search trusted clinics by specialty, city, and language support.
                </p>
              </div>
              <Link href="/search" className="brand-button-secondary w-fit">
                <Search className="h-4 w-4" />
                Search Clinics
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#E5F0EB] px-[10px] pb-[10px]">
      <div className="home-shell">
        <section className="overflow-hidden rounded-[16px] bg-[var(--ahh-blue)] text-white">
          <div className="grid min-h-[600px] items-center gap-10 px-6 pb-16 pt-32 sm:px-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-24 lg:pb-20 lg:pt-40">
            <div className="max-w-4xl">
              <Link href="/pulse" className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/15">
                <ArrowLeft className="h-3.5 w-3.5" />
                AHH Pulse
              </Link>
              <h1 className="text-[32px] sm:text-[58px] lg:text-[72px] font-light leading-[1.06] tracking-normal break-words">
                {staticIssue!.title}
              </h1>
              <p className="mt-7 max-w-3xl text-[17px] leading-7 text-white/78">{staticIssue!.excerpt}</p>
              <div className="mt-5 flex flex-wrap items-center gap-5 text-xs font-medium text-white/72">
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  {staticIssue!.readTime}
                </span>
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {staticIssue!.date}
                </span>
                <span className="inline-flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  {staticIssue!.author}
                </span>
              </div>
            </div>

            <DetailImage
              src={staticIssue!.image}
              alt={staticIssue!.imageAlt}
              className="min-h-[240px] w-full bg-white/90 lg:min-h-[320px]"
              priority
            />
          </div>
        </section>

        <article className="home-section rounded-[16px] bg-white px-5 py-16 sm:px-10 lg:px-20 lg:py-[92px]">
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-[1180px] space-y-16 border-b border-gray-100 pb-16">
              <section className="max-w-5xl">
                <h2 className="text-[28px] font-bold leading-tight text-[var(--ahh-ink)]">
                  5 Summer Health Tips for Vietnamese & Korean Families
                </h2>
                <div className="mt-8 space-y-6 text-[17px] leading-8 text-[var(--ahh-muted)]">
                  <p>
                    Summer in the US brings heat, outdoor activities, travel, and a busy family schedule. It can also bring health risks that Asian immigrant families may be less familiar with, especially when care instructions are only available in English.
                  </p>
                  <p>
                    Here are five reminders from the AHH editorial team to help families prepare for safer summer months, clearer clinic visits, and easier follow-up care.
                  </p>
                </div>
              </section>

              <section className="mx-auto max-w-[860px] rounded-[16px] bg-[var(--ahh-blue)] px-6 py-8 text-center text-white sm:px-10">
                <h2 className="text-[30px] font-light leading-tight sm:text-[36px]">
                  3 New Clinics Added This Month in Los Angeles
                </h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/75">
                  Vietnamese and Korean-speaking clinics verified and listed in LA this month.
                </p>
                <Link href="/search?city=Los%20Angeles" className="brand-button-ghost mt-6 border-white/40 bg-transparent px-6 py-2 text-sm text-white hover:bg-white hover:text-[var(--ahh-blue)]">
                  View LA Clinics
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </section>

              <section className="max-w-5xl">
                <h2 className="text-[28px] font-bold leading-tight text-[var(--ahh-ink)]">
                  5 Summer Health Tips for Vietnamese & Korean Families
                </h2>
                <div className="mt-8 space-y-6 text-[17px] leading-8 text-[var(--ahh-muted)]">
                  <p>
                    Start with heat safety. Older adults, young children, and people with chronic conditions may need extra reminders about hydration, medication timing, and when to seek urgent care during extreme heat.
                  </p>
                  <p>
                    Keep a bilingual care note if possible. A short list of medications, allergies, preferred language, emergency contacts, and recent symptoms can make summer clinic visits less stressful for patients and family caregivers.
                  </p>
                  <p>
                    Before booking a clinic, confirm language support directly. Asian Health Hub helps narrow the search, but patients should still verify the language, provider, insurance, and appointment details before the visit.
                  </p>
                </div>
              </section>
            </div>

            {newsletterAndNavigation}
          </div>
        </article>

        {insightsSection}

        <section className="home-section rounded-[16px] bg-[var(--ahh-mist-2)] px-5 py-10 sm:px-10 lg:px-20">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[28px] font-medium leading-tight text-[var(--ahh-ink)]">Looking for care now?</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--ahh-muted)]">
                Search trusted clinics by specialty, city, and language support.
              </p>
            </div>
            <Link href="/search" className="brand-button-secondary w-fit">
              <Search className="h-4 w-4" />
              Search Clinics
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
