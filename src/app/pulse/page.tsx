import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Leaf, Mail, Search } from 'lucide-react';
import { getPublishedArticles } from '@/services/article-service';
import NewsletterForm from '@/components/pulse/NewsletterForm';

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
    image: '/brand/pulse/detail-summer-health-la.webp',
  },
  {
    issue: '#4',
    month: 'April 2026',
    title: 'Mental Health Awareness - Korean-Speaking Clinics in Houston & Dallas',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Breaking the stigma around mental healthcare for Korean Americans, with clinic spotlights and a new psychiatry clinic guide.',
    image: '/brand/pulse/hero-newsletter.webp',
  },
  {
    issue: '#3',
    month: 'March 2026',
    title: "Women's Health for Vietnamese Patients + OB-GYN Clinic Spotlight",
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Vietnamese-speaking OB-GYN clinics in San Jose and Sacramento, plus what to expect at your first OB-GYN clinic visit in the US.',
    image: '/brand/pulse/hero-newsletter.webp',
  },
  {
    issue: '#2',
    month: 'Feb 2026',
    title: 'New Clinic Search Tips for Vietnamese and Korean Families',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'How to compare language support, insurance notes, location, and provider details before booking an appointment.',
    image: '/brand/pulse/hero-newsletter.webp',
  },
  {
    issue: '#1',
    month: 'Jan 2026',
    title: 'Introducing AHH Pulse: Clinics, Guides, and Care Access Updates',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Our first monthly update for patients looking for language-accessible healthcare across major US cities.',
    image: '/brand/pulse/hero-newsletter.webp',
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

export default async function PulsePage() {
  const [dbNewslettersResult, rawLiveArticlesResult] = await Promise.all([
    getPublishedArticles('pulse', 1, 100),
    getPublishedArticles(undefined, 1, 10),
  ]);
  const dbNewsletters = dbNewslettersResult.data;
  const rawLiveArticles = rawLiveArticlesResult.data;

  const displayNewsletters = dbNewsletters && dbNewsletters.length > 0
    ? dbNewsletters.map((article) => {
      const issueNum = (article.seo_meta as any)?.issue_number || '#Update';
      const rawMonth = (article.seo_meta as any)?.month_label;
      const monthLabel = rawMonth || (article.published_at
        ? new Date(article.published_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : 'Recent');
      const ogImg = (article.seo_meta as any)?.og_image || '';
      return {
        issue: issueNum,
        month: monthLabel,
        title: article.title,
        href: `/pulse/${article.slug}`,
        excerpt: article.excerpt || '',
        image: ogImg || '/brand/pulse/detail-summer-health-la.webp',
      };
    })
    : newsletters;

  const liveArticles = (rawLiveArticles || [])
    .filter((art) => art.category !== 'pulse')
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
    : insights.map((fb) => ({
      title: fb.title,
      href: fb.href,
      image: fb.image,
    }));

  return (
    <div className="bg-[#E5F0EB] px-[10px] pb-[10px]">
      <div className="home-shell">
        <section className="overflow-hidden rounded-[16px] bg-[var(--ahh-blue)] text-white">
          <div className="grid min-h-[600px] items-center gap-10 px-6 pb-16 pt-32 sm:px-10 lg:grid-cols-[minmax(0,1fr)_480px] lg:px-24 lg:pb-20 lg:pt-40">
            <div className="max-w-3xl">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/75">
                <Leaf className="h-3.5 w-3.5 text-[var(--ahh-lime)]" />
                Monthly Newsletter
              </p>
              <h1 className="text-[48px] font-light leading-[1.05] tracking-normal sm:text-[62px] lg:text-[76px]">
                AHH Pulse
              </h1>

              <div className="relative mt-2 mb-6 w-32">
                <div className="h-[1.5px] w-full bg-[#3E8070] rounded-full" />
                <Leaf className="absolute -right-1 -top-1.5 h-3.5 w-3.5 text-[var(--ahh-lime)] rotate-45" />
              </div>

              <p className="mt-7 max-w-2xl text-[17px] leading-7 text-white/82">
                The free monthly newsletter for Vietnamese and Korean American clinic spotlights, health guides, community news, and wellness tips.
              </p>

              <div className="mt-5 flex items-center gap-2 text-xs font-medium text-white/72">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D0FF71" strokeWidth="2.5" className="shrink-0">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>No spam. Unsubscribe anytime.</span>
              </div>

              {/* Live Newsletter Signup Form */}
              <NewsletterForm />
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

          <div className="space-y-6">
            {displayNewsletters.map((newsletter) => (
              <Link
                key={newsletter.issue + newsletter.title}
                href={newsletter.href}
                className="group relative flex flex-col sm:flex-row gap-6 sm:gap-8 rounded-[24px] bg-white border border-[#E9EEF4] p-5 sm:p-6 transition duration-300 hover:shadow-[0_12px_30px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 cursor-pointer"
              >
                {/* Left Side: Artistically nested feature image & Issue block */}
                <div className="relative shrink-0 w-full sm:w-[320px] h-[160px] flex items-center">
                  {/* Background Image: Blur & transparent, scales up and clears on hover */}
                  <div className="relative overflow-hidden rounded-[16px] bg-[#E9EEF4] w-[230px] h-[160px] shadow-3xs">
                    <Image
                      src={newsletter.image}
                      alt={newsletter.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 230px"
                      className="object-cover opacity-35 filter blur-[0.5px] transition duration-500 ease-out group-hover:opacity-100 group-hover:blur-none group-hover:scale-105"
                    />
                  </div>

                  {/* Floating Issue Badge on top right overlaying the image */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[120px] h-[130px] rounded-[16px] bg-[#FDFBF7] border border-[#F2ECE4] p-3 flex flex-col justify-center items-center text-center z-10 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
                    <p className="text-[10px] font-bold text-[var(--ahh-muted)] leading-tight mb-2 uppercase tracking-wider text-center w-full">
                      {newsletter.month}
                    </p>
                    <p className="text-[32px] font-light leading-none text-[var(--ahh-ink)] w-full">
                      {newsletter.issue}
                    </p>
                  </div>
                </div>

                {/* Right Side: Title, excerpt and CTA */}
                <div className="flex flex-1 flex-col justify-center min-w-0">
                  <h3 className="text-lg font-bold leading-snug text-[var(--ahh-ink)] group-hover:text-[var(--ahh-blue)] transition duration-200">
                    {newsletter.title}
                  </h3>
                  <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-[var(--ahh-muted)] line-clamp-2">
                    {newsletter.excerpt}
                  </p>
                  <div className="brand-button-secondary mt-5 min-h-10 w-fit px-5 py-2 text-sm">
                    Read more
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
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
      </div>
    </div>
  );
}
