import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Mail, Search } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AHH Pulse',
  description:
    'AHH Pulse is the monthly Asian Health Hub newsletter for clinic spotlights, health guides, community news, and wellness tips.',
  alternates: {
    canonical: '/pulse',
  },
};

const newsletters = [
  {
    issue: '#5',
    month: 'May 2026',
    title: 'Summer Health Tips for Asian Families + New Verified Clinics in LA',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Top summer health reminders, 3 new verified clinics in Los Angeles, and our guide to finding an OB-GYN clinic without a language barrier.',
  },
  {
    issue: '#4',
    month: 'April 2026',
    title: 'Mental Health Awareness - Korean-Speaking Clinics in Houston & Dallas',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Breaking the stigma around mental healthcare for Korean Americans, with clinic spotlights and a new psychiatry clinic guide.',
  },
  {
    issue: '#3',
    month: 'March 2026',
    title: "Women's Health for Vietnamese Patients + OB-GYN Clinic Spotlight",
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Vietnamese-speaking OB-GYN clinics in San Jose and Sacramento, plus what to expect at your first OB-GYN clinic visit in the US.',
  },
  {
    issue: '#2',
    month: 'Feb 2026',
    title: 'New Clinic Search Tips for Vietnamese and Korean Families',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'How to compare language support, insurance notes, location, and provider details before booking an appointment.',
  },
  {
    issue: '#1',
    month: 'Jan 2026',
    title: 'Introducing AHH Pulse: Clinics, Guides, and Care Access Updates',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Our first monthly update for patients looking for language-accessible healthcare across major US cities.',
  },
] as const;

const insights = [
  {
    title: 'How to Find a Vietnamese-Speaking Doctor Near You',
    href: '/insights',
    image: '/brand/pulse/insight-vietnamese-doctor.webp',
    imageAlt: 'Vietnamese American patient speaking with a doctor',
  },
  {
    title: 'A Simple Healthcare Guide for Vietnamese Patients in the U.S.',
    href: '/insights',
    image: '/brand/pulse/insight-healthcare-guide.webp',
    imageAlt: 'Family reviewing healthcare information on a tablet',
  },
  {
    title: 'What to Ask Before Visiting a Vietnamese-Speaking Clinic',
    href: '/insights',
    image: '/brand/pulse/insight-clinic-questions.webp',
    imageAlt: 'Patient preparing questions before contacting a clinic',
  },
] as const;

function PulseImage({
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

export default function PulsePage() {
  return (
    <div className="bg-[#92C7AD] px-[10px] pb-[10px]">
      <div className="home-shell">
        <section className="overflow-hidden rounded-[16px] bg-[var(--ahh-blue)] text-white">
          <div className="grid min-h-[600px] items-center gap-10 px-6 pb-16 pt-32 sm:px-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-24 lg:pb-20 lg:pt-40">
            <div className="max-w-3xl">
              <p className="mb-5 inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/75">
                Monthly Newsletter
              </p>
              <h1 className="text-[48px] font-light leading-[1.05] tracking-normal sm:text-[62px] lg:text-[76px]">
                AHH Pulse
              </h1>
              <p className="mt-7 max-w-2xl text-[17px] leading-7 text-white/82">
                The free monthly newsletter for Vietnamese and Korean American clinic spotlights, health guides, community news, and wellness tips.
              </p>
              <p className="mt-3 text-xs font-medium text-white/68">No spam. Unsubscribe anytime.</p>

              <form action="/pulse" className="mt-6 flex max-w-[560px] flex-col gap-2 rounded-full bg-white p-1 shadow-[0_18px_50px_rgba(2,78,68,0.18)] sm:flex-row sm:items-center">
                <div className="flex min-h-12 flex-1 items-center gap-2 rounded-full px-4">
                  <Mail className="h-4 w-4 text-[var(--ahh-blue)]" />
                  <input
                    name="email"
                    type="email"
                    placeholder="Enter your email address"
                    className="w-full bg-transparent text-sm text-[var(--ahh-ink)] outline-none placeholder:text-[var(--ahh-muted-2)]"
                  />
                </div>
                <button type="submit" className="min-h-12 rounded-full bg-[var(--ahh-blue)] px-6 text-sm font-bold text-white transition hover:bg-[var(--ahh-deep-teal)]">
                  Subscribe Free
                </button>
              </form>
            </div>

            <PulseImage
              src="/brand/pulse/hero-newsletter.webp"
              alt="Patient reading the AHH Pulse health newsletter"
              className="min-h-[240px] w-full bg-white/90 lg:min-h-[320px]"
              priority
            />
          </div>
        </section>

        <section className="home-section rounded-[16px] bg-white px-5 py-16 sm:px-10 lg:px-20 lg:py-[88px]">
          <div className="mb-10">
            <h2 className="text-[42px] font-light leading-tight text-[var(--ahh-ink)] lg:text-[56px]">Newsletter Archive</h2>
            <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[var(--ahh-muted)]">
              Read the latest Pulse updates about healthcare access, clinic search tips, language support, and patient education for Asian communities.
            </p>
          </div>

          <div className="space-y-5">
            {newsletters.map((newsletter) => (
              <article key={newsletter.issue} className="grid gap-5 rounded-[16px] bg-[var(--ahh-mist-2)] p-5 sm:grid-cols-[190px_minmax(0,1fr)] sm:p-8">
                <div className="flex min-h-[108px] items-center justify-center rounded-[16px] bg-[#9DB4CC] text-center text-[var(--ahh-ink)]">
                  <div>
                    <p className="text-sm font-bold">{newsletter.month}</p>
                    <p className="text-[38px] font-light leading-none">{newsletter.issue}</p>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col justify-center">
                  <h3 className="text-lg font-bold leading-snug text-[var(--ahh-ink)]">{newsletter.title}</h3>
                  <p className="mt-4 max-w-3xl text-xs leading-6 text-[var(--ahh-muted)]">{newsletter.excerpt}</p>
                  <Link href={newsletter.href} className="brand-button-secondary mt-5 min-h-10 w-fit px-5 py-2 text-sm">
                    Read more
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

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
            {insights.map((insight) => (
              <Link key={insight.title} href={insight.href} className="brand-card group overflow-hidden bg-white transition hover:-translate-y-0.5 hover:shadow-md">
                <PulseImage src={insight.image} alt={insight.imageAlt} className="aspect-[16/10] rounded-none" />
                <div className="p-5">
                  <h3 className="line-clamp-2 min-h-[48px] text-base font-bold leading-6 text-[var(--ahh-ink)] group-hover:text-[var(--ahh-blue)]">
                    {insight.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="home-section rounded-[16px] bg-white px-5 py-10 sm:px-10 lg:px-20">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[28px] font-medium leading-tight text-[var(--ahh-ink)]">Never miss a clinic update.</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--ahh-muted)]">
                Monthly clinic spotlights, patient guides, and community wellness tips.
              </p>
            </div>
            <Link href="/search" className="brand-button-secondary w-fit">
              <Search className="h-4 w-4" />
              Find a Clinic
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
