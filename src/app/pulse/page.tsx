import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublishedArticles } from '@/services/article-service';
import NewsletterForm from '@/components/pulse/NewsletterForm';
import { SiteImg } from '@/components/site/img';
import { ArrowCircle, Caption, Display, Grid, Page, PhotoTile, Pill, Tile, pad, ring, tile } from '@/components/site/ui';

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
    image: '/brand/photos/clinic-1.webp',
  },
  {
    issue: '#4',
    month: 'April 2026',
    title: 'Mental Health Awareness - Korean-Speaking Clinics in Houston & Dallas',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Breaking the stigma around mental healthcare for Korean Americans, with clinic spotlights and a new psychiatry clinic guide.',
    image: '/brand/photos/a3-guide-left.webp',
  },
  {
    issue: '#3',
    month: 'March 2026',
    title: "Women's Health for Vietnamese Patients + OB-GYN Clinic Spotlight",
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Vietnamese-speaking OB-GYN clinics in San Jose and Sacramento, plus what to expect at your first OB-GYN clinic visit in the US.',
    image: '/brand/photos/a3-guide-left.webp',
  },
  {
    issue: '#2',
    month: 'Feb 2026',
    title: 'New Clinic Search Tips for Vietnamese and Korean Families',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'How to compare language support, insurance notes, location, and provider details before booking an appointment.',
    image: '/brand/photos/a3-guide-left.webp',
  },
  {
    issue: '#1',
    month: 'Jan 2026',
    title: 'Introducing AHH Pulse: Clinics, Guides, and Care Access Updates',
    href: '/pulse/summer-health-tips-asian-families-new-verified-clinics-la',
    excerpt:
      'Our first monthly update for patients looking for language-accessible healthcare across major US cities.',
    image: '/brand/photos/a3-guide-left.webp',
  },
] as const;

const insights = [
  {
    title: 'How to Find a Vietnamese-Speaking Doctor Near You',
    href: '/insights',
    image: '/brand/photos/a4-guide-right.webp',
    imageAlt: 'Vietnamese American patient speaking with a doctor',
  },
  {
    title: 'A Simple Healthcare Guide for Vietnamese Patients in the U.S.',
    href: '/insights',
    image: '/brand/photos/h3-step-compare.webp',
    imageAlt: 'Family reviewing healthcare information on a tablet',
  },
  {
    title: 'What to Ask Before Visiting a Vietnamese-Speaking Clinic',
    href: '/insights',
    image: '/brand/photos/clinic-3.webp',
    imageAlt: 'Patient preparing questions before contacting a clinic',
  },
] as const;

/** issues without a usable cover get one of the site photos, a different one per position */
const ISSUE_PHOTOS = ['h2-step-filter', 'c4-card-zh', 'h3-step-compare', 'clinic-1', 'a4-guide-right', 'b3-steps', 'clinic-3', 'a5-tall-portrait'].map(
  (n) => `/brand/photos/${n}.webp`,
);

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
        image: ogImg || '/brand/photos/clinic-1.webp',
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
        image: ogImg || '/brand/photos/a4-guide-right.webp',
      };
    })
    : insights.map((fb) => ({
      title: fb.title,
      href: fb.href,
      image: fb.image,
    }));

  return (
    <Page>
      {/* Hero: title and signup beside the photo */}
      <Grid className="md:grid-cols-2">
        <Tile tone="green" as="header" className={`flex min-h-[30rem] flex-col justify-between gap-10 ${pad}`}>
          <Caption className="opacity-80">Monthly newsletter · free</Caption>
          <div>
            <Display as="h1">
              AHH
              <br />
              Pulse
            </Display>
            <Caption className="mt-5 opacity-85">Clinic spotlights and health tips, once a month</Caption>
            <NewsletterForm />
          </div>
        </Tile>
        <PhotoTile src="/brand/photos/a3-guide-left.webp" alt="A daughter and her mother reading together" className="min-h-[22rem]" eager />
      </Grid>

      {/* Archive */}
      <Grid className="md:grid-cols-4">
        <Tile tone="zinc" className={`flex min-h-[14rem] flex-col justify-between gap-6 md:row-span-2 ${pad}`}>
          <Display size="text-[clamp(2.5rem,5vw,5rem)]">
            Past
            <br />
            issues
          </Display>
          <Caption className="opacity-75">Every issue so far</Caption>
        </Tile>
        {displayNewsletters.map((n, i) => (
          <Link
            key={n.issue + n.title}
            href={n.href}
            className={`group flex flex-col overflow-hidden ${tile} ${i % 2 ? 'bg-[#FBF4EC]' : 'bg-stone-50'} ${ring}`}
          >
            <div className="relative m-2 aspect-[16/9] overflow-hidden rounded-lg md:m-3 md:rounded-xl">
              <SiteImg src={n.image} fallback={ISSUE_PHOTOS[i % ISSUE_PHOTOS.length]} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold backdrop-blur-md">
                {n.issue} · {n.month}
              </span>
            </div>
            <div className="px-4 pb-5 pt-2 md:px-5 md:pb-6">
              <h3 className="line-clamp-3 text-lg font-bold leading-snug group-hover:underline">{n.title}</h3>
            </div>
          </Link>
        ))}
      </Grid>

      {/* Related reading */}
      <Grid className="md:grid-cols-4">
        <Tile tone="mint" className={`flex min-h-[14rem] flex-col justify-between gap-6 ${pad}`}>
          <h2 className="text-3xl font-bold leading-[1.02] tracking-tight md:text-4xl">Health guides</h2>
          <Pill href="/insights" className="self-start">See all guides</Pill>
        </Tile>
        {displayInsights.map((insight, idx) => (
          <Link key={insight.title + idx} href={insight.href} className={`group relative min-h-[18rem] overflow-hidden ${tile} ${ring}`}>
            <SiteImg
              src={insight.image}
              fallback="/brand/photos/a4-guide-right.webp"
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-4 p-2 text-white md:bottom-4 md:left-4 md:right-4">
              <h3 className="line-clamp-3 text-lg font-bold leading-snug">{insight.title}</h3>
              <ArrowCircle light />
            </div>
          </Link>
        ))}
      </Grid>
    </Page>
  );
}
