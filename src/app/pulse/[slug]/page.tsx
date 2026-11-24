import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getArticleBySlug, getPublishedArticles } from '@/services/article-service';
import NewsletterForm from '@/components/pulse/NewsletterForm';
import { SiteImg } from '@/components/site/img';
import { ArrowCircle, Grid, Pill, Tile, pad, ring, tile } from '@/components/site/ui';
import { PostHeader, PostPage, postWrap } from '@/components/site/post';

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
    image: '/brand/photos/clinic-1.webp',
    imageAlt: 'Asian American family reviewing summer health tips and clinic options',
  },
];

const fallbackInsights = [
  {
    title: 'How to Find a Vietnamese-Speaking Doctor Near You',
    slug: 'how-to-find-vietnamese-speaking-doctor-near-you',
    image: '/brand/photos/a4-guide-right.webp',
  },
  {
    title: 'A Simple Healthcare Guide for Vietnamese Patients in the U.S.',
    slug: 'simple-healthcare-guide-vietnamese-patients-us',
    image: '/brand/photos/h3-step-compare.webp',
  },
  {
    title: 'What to Ask Before Visiting a Vietnamese-Speaking Clinic',
    slug: 'what-to-ask-before-visiting-vietnamese-speaking-clinic',
    image: '/brand/photos/clinic-3.webp',
  },
];

function getStaticIssue(slug: string) {
  return pulseIssues.find((issue) => issue.slug === slug);
}

export const dynamic = 'force-dynamic';

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

const pulseMarkdownComponents = {
  h1: ({ children }: any) => <h2 className="text-[24px] sm:text-[28px] font-bold leading-tight text-[#0D1F1C] mt-10 mb-4 break-words">{children}</h2>,
  h2: ({ children }: any) => <h2 className="text-xl sm:text-2xl font-bold leading-tight text-[#0D1F1C] mt-8 mb-4 break-words">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg sm:text-xl font-bold text-[#0D1F1C] mt-6 mb-3 break-words">{children}</h3>,
  p: ({ children }: any) => <p className="text-[17px] leading-8 text-[#0D1F1C]/80 mb-6">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-6 mb-6 space-y-2 text-[17px] text-[#0D1F1C]/80">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-6 mb-6 space-y-2 text-[17px] text-[#0D1F1C]/80">{children}</ol>,
  li: ({ children }: any) => <li>{children}</li>,
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-8 rounded-xl border border-gray-200/60 shadow-3xs max-w-full">
      <table className="min-w-full divide-y divide-gray-200 text-sm text-left">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-stone-50">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>,
  tr: ({ children }: any) => <tr>{children}</tr>,
  th: ({ children }: any) => <th className="px-6 py-3 font-bold text-[#0D1F1C] text-xs uppercase tracking-wider">{children}</th>,
  td: ({ children }: any) => <td className="px-6 py-4 text-[#0D1F1C]/80 text-[13px]">{children}</td>,
  a: ({ href, children }: any) => (
    <a href={href} className="font-semibold text-[#024E44] underline underline-offset-4 transition" target="_blank" rel="noreferrer">
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
          image: ogImg || '/brand/photos/a4-guide-right.webp',
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

  const navLink = 'inline-flex min-h-11 items-center gap-2 rounded-full border border-[#0D1F1C]/25 px-5 text-sm font-bold transition-colors hover:border-[#0D1F1C]';
  const issueNav = (
    <nav className="mt-12 flex items-center justify-between gap-4 border-t border-[#0D1F1C]/10 pt-8" aria-label="Pulse issues">
      {prevPulse ? (
        <Link href={`/pulse/${prevPulse.slug}`} className={`${navLink} ${ring}`}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Previous issue
        </Link>
      ) : (
        <span className={`${navLink} opacity-35`} aria-hidden="true">
          <ArrowLeft className="h-4 w-4" />
          Previous issue
        </span>
      )}
      {nextPulse ? (
        <Link href={`/pulse/${nextPulse.slug}`} className={`${navLink} ${ring}`}>
          Next issue
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className={`${navLink} opacity-35`} aria-hidden="true">
          Next issue
          <ArrowRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );

  /** sticky sidebar beside the reading column, as on the clinic profile */
  const sidebar = (
    <aside className="flex flex-col gap-2 self-start md:gap-3 lg:sticky lg:top-24">
      <section className="rounded-xl bg-[#024E44] p-5 text-white md:rounded-2xl md:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">AHH Pulse</p>
        <h2 className="mt-2 text-2xl font-bold leading-tight">Get the next issue</h2>
        <NewsletterForm />
      </section>
      <Link href="/search" className={`group flex items-end justify-between gap-4 rounded-xl bg-[#E3F1EC] p-5 md:rounded-2xl md:p-6 ${ring}`}>
        <h2 className="text-xl font-bold leading-tight">Find a clinic that speaks your language</h2>
        <ArrowCircle />
      </Link>
    </aside>
  );

  const closing = (
    <Grid className={`${postWrap} mt-16 md:mt-24 md:grid-cols-4`}>
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
  );

  /** the page: clinic-style header, then the reading column beside the sticky sidebar */
  const layout = (
    issue: { title: string; excerpt: string; month: string; readTime: string; author: string; image: string | null; alt: string; number?: string },
    body: React.ReactNode,
  ) => (
    <PostPage>
      <PostHeader
        crumbs={[{ label: 'AHH Pulse', href: '/pulse' }, { label: issue.month }]}
        title={issue.title}
        meta={[issue.month, issue.readTime, issue.author]}
        image={issue.image}
        fallback="/brand/photos/clinic-1.webp"
        imageAlt={issue.alt}
        glanceTitle="In this issue"
        glance={[
          ...(issue.number ? [{ label: 'Issue', value: issue.number }] : []),
          { label: 'Published', value: issue.month },
          { label: 'Reading time', value: issue.readTime },
          { label: 'Written by', value: issue.author },
        ]}
      />
      <div className={`${postWrap} mt-10 grid gap-10 md:mt-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16`}>
        <article className="min-w-0 max-w-[48rem]">
          {issue.excerpt && <p className="mb-10 text-lg font-medium leading-relaxed md:text-xl">{issue.excerpt}</p>}
          {body}
          {issueNav}
        </article>
        {sidebar}
      </div>
      {closing}
    </PostPage>
  );

  if (dbArticle) {
    const rawMonth = (dbArticle.seo_meta as any)?.month_label;
    const monthLabel = rawMonth || (dbArticle.published_at
      ? new Date(dbArticle.published_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : 'Recent');
    const imageSrc = (dbArticle.seo_meta as any)?.og_image || '';
    const issueNumber = (dbArticle.seo_meta as Record<string, unknown> | null)?.issue_number as string | undefined;
    // the stored body often repeats the title as its first heading; the page header already shows it
    const content = dbArticle.content.replace(/^\s*#{1,2}\s+(.+)\n/, (line, heading: string) =>
      heading.trim().toLowerCase() === dbArticle.title.trim().toLowerCase() ? '' : line,
    );

    return layout(
      {
        title: dbArticle.title,
        excerpt: dbArticle.excerpt || '',
        month: monthLabel,
        readTime: '8 min read',
        author: dbArticle.author || 'AHH Medical Team',
        image: imageSrc || null,
        alt: dbArticle.title,
        number: issueNumber,
      },
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={pulseMarkdownComponents}>
        {content}
      </ReactMarkdown>,
    );
  }

  return layout(
    {
      title: staticIssue!.title,
      excerpt: staticIssue!.excerpt,
      month: staticIssue!.date,
      readTime: staticIssue!.readTime,
      author: staticIssue!.author,
      image: staticIssue!.image,
      alt: staticIssue!.imageAlt,
    },
    <div className="space-y-12">
      <section>
        <h2 className="text-2xl font-bold leading-tight md:text-3xl">5 Summer Health Tips for Vietnamese &amp; Korean Families</h2>
        <div className="mt-6 space-y-5 text-[1.0625rem] leading-8 opacity-80">
          <p>
            Summer in the US brings heat, outdoor activities, travel, and a busy family schedule. It can also bring health risks that Asian immigrant families may be less familiar with, especially when care instructions are only available in English.
          </p>
          <p>
            Here are five reminders from the AHH editorial team to help families prepare for safer summer months, clearer clinic visits, and easier follow-up care.
          </p>
        </div>
      </section>

      <Link href="/search?city=Los%20Angeles" className={`group flex flex-col justify-between gap-6 rounded-xl bg-[#E3F1EC] p-6 md:flex-row md:items-end md:rounded-2xl md:p-8 ${ring}`}>
        <div>
          <h2 className="text-2xl font-bold leading-tight md:text-3xl">3 New Clinics Added This Month in Los Angeles</h2>
          <p className="mt-2 max-w-xl text-sm font-medium opacity-75">Vietnamese and Korean-speaking clinics verified and listed in LA this month.</p>
        </div>
        <ArrowCircle />
      </Link>

      <section>
        <h2 className="text-2xl font-bold leading-tight md:text-3xl">5 Summer Health Tips for Vietnamese &amp; Korean Families</h2>
        <div className="mt-6 space-y-5 text-[1.0625rem] leading-8 opacity-80">
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
    </div>,
  );
}
