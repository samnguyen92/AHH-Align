import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Mail, Search, UserRound } from 'lucide-react';
import { notFound } from 'next/navigation';

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

function getIssue(slug: string) {
  return pulseIssues.find((issue) => issue.slug === slug);
}

export function generateStaticParams() {
  return pulseIssues.map((issue) => ({ slug: issue.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const issue = getIssue(slug);

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

export default async function PulseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = getIssue(slug);

  if (!issue) {
    notFound();
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
              <h1 className="text-[42px] font-light leading-[1.06] tracking-normal sm:text-[58px] lg:text-[72px]">
                {issue.title}
              </h1>
              <p className="mt-7 max-w-3xl text-[17px] leading-7 text-white/78">{issue.excerpt}</p>
              <div className="mt-5 flex flex-wrap items-center gap-5 text-xs font-medium text-white/72">
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  {issue.readTime}
                </span>
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {issue.date}
                </span>
                <span className="inline-flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  {issue.author}
                </span>
              </div>
            </div>

            <DetailImage
              src={issue.image}
              alt={issue.imageAlt}
              className="min-h-[240px] w-full bg-white/90 lg:min-h-[320px]"
              priority
            />
          </div>
        </section>

        <article className="home-section rounded-[16px] bg-white px-5 py-16 sm:px-10 lg:px-20 lg:py-[92px]">
          <div className="mx-auto max-w-[1180px] space-y-16">
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

            <section className="mx-auto max-w-[860px] rounded-[16px] bg-[var(--ahh-blue)] px-6 py-8 text-center text-white sm:px-10">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
                <Mail className="h-6 w-6" />
              </div>
              <h2 className="text-[30px] font-light leading-tight sm:text-[36px]">AHH Pulse Newsletter</h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Health tips and clinic spotlights for Asian Americans.
              </p>
              <form action="/pulse" className="mx-auto mt-6 flex max-w-[520px] flex-col gap-2 rounded-full border border-white/35 bg-transparent p-1 sm:flex-row sm:items-center">
                <input
                  name="email"
                  type="email"
                  placeholder="Enter Your Email Address"
                  className="min-h-11 flex-1 rounded-full bg-transparent px-5 text-sm text-white outline-none placeholder:text-white/70"
                />
                <button type="submit" className="min-h-11 rounded-full bg-white px-6 text-sm font-bold text-[var(--ahh-blue)]">
                  Subscribe
                </button>
              </form>
            </section>

            <nav className="flex items-center justify-between gap-4 pt-4 text-sm text-[var(--ahh-muted)]">
              <Link href="/pulse" className="inline-flex items-center gap-2 transition hover:text-[var(--ahh-blue)]">
                Next Pulse
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pulse" className="inline-flex items-center gap-2 transition hover:text-[var(--ahh-blue)]">
                Previous Pulse
                <ArrowRight className="h-4 w-4" />
              </Link>
            </nav>
          </div>
        </article>

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
