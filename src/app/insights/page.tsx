import { Metadata } from 'next';
import Link from 'next/link';
import { SiteImg } from '@/components/site/img';
import { ArrowCircle, Caption, Display, Grid, Page, Pill, Tile, pad, ring, tile } from '@/components/site/ui';
import { getSafeArticleImageSrc } from '@/lib/article-image';
import {
  getArticleTags,
  getPublishedArticlesByMode,
  slugifyArticleCategory,
} from '@/services/article-service';
import type { Article } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Health Insights & Guides',
  description: 'Expert medical guides, healthcare tips, and community health news for the Asian community.',
};

const DEFAULT_HOT_TAGS = [
  'Immigration-Health',
  'Wellness',
  'Primary Care',
  'Houston',
  'Dental',
  'USCIS Examination',
  'Vaccination',
  'Children Care',
  'Korean',
];

const CATEGORY_FILTERS = [
  { label: 'All Articles', slug: null },
  { label: 'Quick Insights', slug: 'insight' },
  { label: 'In-Depth Guides', slug: 'guide' },
];

function categoryHref(categorySlug: string) {
  return `/insights?category=${categorySlug}`;
}

function tagHref(tagSlug: string) {
  return `/insights?tag=${tagSlug}`;
}

function formatDate(date: string | null) {
  if (!date) return 'Recently';

  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** site photos stand in when an article has no usable image, a different one per position */
const ARTICLE_FALLBACKS = ['a3-guide-left', 'a4-guide-right', 'b3-steps', 'h2-step-filter', 'h3-step-compare', 'a2-section2'].map(
  (n) => `/brand/photos/${n}.webp`,
);
const fallbackAt = (i: number) => ARTICLE_FALLBACKS[i % ARTICLE_FALLBACKS.length];

function ArticlePhoto({ article, i, eager }: { article: Article; i: number; eager?: boolean }) {
  return (
    <SiteImg
      src={getSafeArticleImageSrc(article.seo_meta.og_image)}
      fallback={fallbackAt(i)}
      alt=""
      eager={eager}
      className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
    />
  );
}

function Meta({ article, light = false }: { article: Article; light?: boolean }) {
  return <p className={`text-xs font-semibold ${light ? 'opacity-90' : 'opacity-55'}`}>{formatDate(article.published_at)}</p>;
}

/** the lead story of a section: a photo tile with the headline over it */
function LeadCard({ article, i }: { article: Article; i: number }) {
  return (
    <Link href={`/insights/${article.slug}`} className={`group relative block h-full min-h-[30rem] overflow-hidden ${tile} ${ring} md:min-h-[min(48rem,88svh)]`}>
      <ArticlePhoto article={article} i={i} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-6 p-3 text-white md:bottom-6 md:left-6 md:right-6 md:p-5">
        <div className="min-w-0">
          <Meta article={article} light />
          <h3 className="mt-3 line-clamp-3 max-w-[20ch] text-[clamp(2.25rem,4.4vw,4.5rem)] font-bold leading-[0.98] tracking-tight">{article.title}</h3>
        </div>
        <ArrowCircle light className="hidden md:flex" />
      </div>
    </Link>
  );
}

const STORY_BG = ['bg-stone-50', 'bg-[#E3F1EC]', 'bg-[#FBF4EC]', 'bg-stone-50'] as const;

/** a standard story: photo on top, words below on the tile */
function StoryCard({ article, i, bg }: { article: Article; i: number; bg: string }) {
  return (
    <Link href={`/insights/${article.slug}`} className={`group flex flex-col overflow-hidden ${tile} ${bg} ${ring}`}>
      <div className="relative m-2 aspect-[4/3] overflow-hidden rounded-lg md:m-3 md:rounded-xl">
        <ArticlePhoto article={article} i={i} />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-5 pt-2 md:px-5 md:pb-6">
        <h3 className="line-clamp-3 text-lg font-bold leading-snug group-hover:underline">{article.title}</h3>
        <div className="mt-auto pt-1">
          <Meta article={article} />
        </div>
      </div>
    </Link>
  );
}

function ArticleSection({
  title,
  description,
  articles,
  viewAllHref,
  showAll = false,
  offset = 0,
  tone = 'zinc',
}: {
  title: string;
  description: string;
  articles: Article[];
  viewAllHref: string;
  showAll?: boolean;
  offset?: number;
  tone?: 'zinc' | 'ink';
}) {
  const [lead, ...rest] = articles;
  const more = showAll ? rest : rest.slice(0, 4);

  return (
    <>
      <Grid className="md:grid-cols-4">
        <Tile tone={tone} className={`flex min-h-[14rem] flex-col justify-between gap-6 ${pad}`}>
          <Display size="text-[clamp(2.25rem,3.6vw,4rem)]">{title}</Display>
          <div>
            <Caption className="opacity-75">{description}</Caption>
            {!showAll && articles.length > 1 && (
              <Pill href={viewAllHref} variant={tone === 'ink' ? 'white' : 'ink'} className="mt-5">
                View all
              </Pill>
            )}
          </div>
        </Tile>
        <div className="md:col-span-3">
          {lead ? (
            <LeadCard article={lead} i={offset} />
          ) : (
            <Tile tone="stone" className={`h-full ${pad}`}>
              <Caption>No articles here yet.</Caption>
            </Tile>
          )}
        </div>
      </Grid>
      {more.length > 0 && (
        <Grid className="sm:grid-cols-2 lg:grid-cols-4">
          {more.map((a, i) => (
            <StoryCard key={a.id} article={a} i={offset + 1 + i} bg={STORY_BG[i % STORY_BG.length]} />
          ))}
        </Grid>
      )}
    </>
  );
}

function isModeCategory(categorySlug?: string) {
  return (
    categorySlug === 'insight' ||
    categorySlug === 'insights' ||
    categorySlug === 'guide' ||
    categorySlug === 'guides' ||
    categorySlug === 'in-depth-guides'
  );
}

/** stored tags are sometimes slugs ("AAPI-heritage-month"); show them as words */
function topicLabel(tag: string) {
  if (tag.includes(' ') || !tag.includes('-')) return tag;
  return tag
    .split('-')
    .map((w) => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tag?: string }>;
}) {
  const { category, tag } = await searchParams;
  const categorySlug = category ? slugifyArticleCategory(category) : undefined;
  const tagSlug = tag ? slugifyArticleCategory(tag) : undefined;
  const selectedMode =
    categorySlug === 'guide' || categorySlug === 'guides' || categorySlug === 'in-depth-guides'
      ? 'guide'
      : categorySlug === 'insight' || categorySlug === 'insights'
        ? 'insight'
        : null;
  const articleLimit = categorySlug || tagSlug ? 60 : 7;

  const filters = { categorySlug, tagSlug };
  const [latestInsights, latestGuides, articleTags] = await Promise.all([
    selectedMode === 'guide' ? Promise.resolve([]) : getPublishedArticlesByMode('insight', filters, articleLimit),
    selectedMode === 'insight' ? Promise.resolve([]) : getPublishedArticlesByMode('guide', filters, articleLimit),
    getArticleTags(),
  ]);

  const heroArticle = latestInsights[0] ?? latestGuides[0];
  const topics = [...new Set([...articleTags, ...DEFAULT_HOT_TAGS])]
    .map((topic) => ({ label: topicLabel(topic), slug: slugifyArticleCategory(topic) }))
    .filter((topic) => topic.slug && !isModeCategory(topic.slug))
    .slice(0, 10);

  return (
    <Page>
      {/* Hero: title tile, then the featured story */}
      <Grid className="md:grid-cols-2">
        <Tile tone="stone" as="header" className={`flex min-h-[28rem] flex-col justify-between gap-10 ${pad}`}>
          <Caption>Health Guides</Caption>
          <div>
            <Display as="h1">
              Health
              <br />
              guides for
              <br />
              your family
            </Display>
            <Caption className="mt-5 opacity-75">Written for Vietnamese, Korean and Chinese American families</Caption>
            <nav className="mt-7 flex flex-wrap gap-1.5" aria-label="Article type">
              {CATEGORY_FILTERS.map((filter) => {
                const isActive = (!filter.slug && !categorySlug && !tagSlug) || filter.slug === selectedMode;
                return (
                  <Link
                    key={filter.label}
                    href={filter.slug ? categoryHref(filter.slug) : '/insights'}
                    aria-current={isActive ? 'page' : undefined}
                    className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${ring} ${
                      isActive ? 'bg-[#0D1F1C] text-white' : 'bg-white ring-1 ring-[#0D1F1C]/10 hover:bg-[#E3F1EC]'
                    }`}
                  >
                    {filter.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </Tile>
        {heroArticle ? (
          <Link href={`/insights/${heroArticle.slug}`} className={`group relative min-h-[24rem] overflow-hidden ${tile} ${ring}`}>
            <ArticlePhoto article={heroArticle} i={5} eager />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
            <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold backdrop-blur-md md:left-5 md:top-5">
              Featured story
            </span>
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-6 rounded-xl bg-black/30 p-4 text-white backdrop-blur-xl md:bottom-5 md:left-5 md:right-5 md:rounded-2xl md:p-5">
              <div className="min-w-0">
                <h2 className="line-clamp-2 text-xl font-bold leading-tight md:text-2xl">{heroArticle.title}</h2>
              </div>
              <ArrowCircle light />
            </div>
          </Link>
        ) : (
          <Tile tone="mint" className={pad}>
            <Caption>No published articles yet.</Caption>
          </Tile>
        )}
      </Grid>

      {/* Topics */}
      {/* phones: one row that scrolls sideways; wider screens: the chips wrap beside the label */}
      <Tile tone="stone" className="py-4 md:flex md:items-center md:gap-4 md:px-7 md:py-5">
        <span className="block px-4 text-xs font-semibold uppercase tracking-widest opacity-55 md:shrink-0 md:px-0">Topics</span>
        <nav
          className="mt-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mt-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
          aria-label="Filter by topic"
        >
          {[{ label: 'All topics', slug: '' }, ...topics].map((topic) => {
            const on = topic.slug ? tagSlug === topic.slug : !categorySlug && !tagSlug;
            return (
              <Link
                key={topic.slug || 'all'}
                href={topic.slug ? tagHref(topic.slug) : '/insights'}
                aria-current={on ? 'page' : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${ring} ${
                  on ? 'bg-[#024E44] text-white' : 'bg-white hover:bg-[#E3F1EC]'
                }`}
              >
                {topic.label}
              </Link>
            );
          })}
        </nav>
      </Tile>

      {selectedMode !== 'guide' && (
        <ArticleSection
          title="Latest insights"
          description="Short reads for patients and caregivers"
          articles={latestInsights}
          viewAllHref={categoryHref('insights')}
          showAll={Boolean(categorySlug || tagSlug)}
        />
      )}

      {selectedMode !== 'insight' && (
        <ArticleSection
          title="In-depth guides"
          description="Step by step, from insurance to screenings"
          articles={latestGuides}
          viewAllHref={categoryHref('guides')}
          showAll={Boolean(categorySlug || tagSlug)}
          offset={3}
          tone="ink"
        />
      )}

      {/* Closing: put it into action */}
      <Grid className="md:grid-cols-4">
        <Link href="/search" className={`group relative min-h-[22rem] overflow-hidden md:col-span-3 ${tile} ${ring}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/photos/a1-hero.webp" alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-6 text-white md:bottom-7 md:left-7 md:right-7">
            <div>
              <h2 className="max-w-[18ch] text-[clamp(2rem,4.5vw,4.5rem)] font-bold leading-[0.95] tracking-tight">
                Ready to speak with a doctor in your language?
              </h2>
            </div>
            <ArrowCircle light />
          </div>
        </Link>
        <Tile tone="mint" className={`flex min-h-[16rem] flex-col justify-between gap-6 ${pad}`}>
          <div>
            <Caption className="text-[#024E44]">For clinics</Caption>
            <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
              Claim
              <br />
              your free
              <br />
              profile
            </h3>
          </div>
          <Pill href="/claim" className="self-start">Claim Now</Pill>
        </Tile>
      </Grid>
    </Page>
  );
}
