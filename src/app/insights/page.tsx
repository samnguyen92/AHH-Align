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
import { getServerLocale } from '@/lib/i18n/server';
import type { SupportedLocale } from '@/lib/states';

const INSIGHTS_COPY: Record<
  SupportedLocale,
  {
    eyebrow: string;
    heroTitle: string;
    heroSub: string;
    allArticles: string;
    quickInsights: string;
    inDepthGuides: string;
    featuredStory: string;
    noArticles: string;
    topics: string;
    allTopics: string;
    latestInsights: string;
    latestInsightsSub: string;
    guidesTitle: string;
    guidesSub: string;
    closingTitle: string;
    forClinics: string;
    claimTitle: string;
    claimNow: string;
  }
> = {
  en: {
    eyebrow: 'Health Guides',
    heroTitle: 'Health guides for your family',
    heroSub: 'Written for Vietnamese, Korean and Chinese American families',
    allArticles: 'All Articles',
    quickInsights: 'Quick Insights',
    inDepthGuides: 'In-Depth Guides',
    featuredStory: 'Featured story',
    noArticles: 'No published articles yet.',
    topics: 'Topics',
    allTopics: 'All topics',
    latestInsights: 'Latest insights',
    latestInsightsSub: 'Short reads for patients and caregivers',
    guidesTitle: 'In-depth guides',
    guidesSub: 'Step by step, from insurance to screenings',
    closingTitle: 'Ready to speak with a doctor in your language?',
    forClinics: 'For clinics',
    claimTitle: 'Claim your free profile',
    claimNow: 'Claim Now',
  },
  vi: {
    eyebrow: 'Cẩm nang sức khỏe',
    heroTitle: 'Cẩm nang y tế cho gia đình bạn',
    heroSub: 'Biên soạn cho các gia đình người Việt, Hàn và Hoa tại Mỹ',
    allArticles: 'Tất cả bài viết',
    quickInsights: 'Kiến thức nhanh',
    inDepthGuides: 'Hướng dẫn chuyên sâu',
    featuredStory: 'Bài viết nổi bật',
    noArticles: 'Chưa có bài viết nào.',
    topics: 'Chủ đề',
    allTopics: 'Tất cả chủ đề',
    latestInsights: 'Bài viết mới nhất',
    latestInsightsSub: 'Kiến thức thiết thực cho bệnh nhân và người chăm sóc',
    guidesTitle: 'Hướng dẫn chuyên sâu',
    guidesSub: 'Từng bước chi tiết, từ bảo hiểm đến tầm soát bệnh',
    closingTitle: 'Sẵn sàng gặp bác sĩ nói ngôn ngữ của bạn?',
    forClinics: 'Dành cho phòng khám',
    claimTitle: 'Xác nhận hồ sơ miễn phí',
    claimNow: 'Xác nhận ngay',
  },
  ko: {
    eyebrow: '건강 가이드',
    heroTitle: '우리 가족을 위한 건강 가이드',
    heroSub: '미국 내 한인·베트남계·중국계 가정을 위해 쉽게 정리한 의료 가이드',
    allArticles: '전체 글',
    quickInsights: '핵심 인사이트',
    inDepthGuides: '심층 가이드',
    featuredStory: '주요 아티클',
    noArticles: '등록된 글이 없습니다.',
    topics: '주제',
    allTopics: '전체 주제',
    latestInsights: '최신 건강 인사이트',
    latestInsightsSub: '환자와 보호자를 위한 핵심 건강 정보',
    guidesTitle: '심층 의료 가이드',
    guidesSub: '보험 안내부터 건강검진까지 단계별 안내',
    closingTitle: '모국어로 소통하는 의사를 찾고 계신가요?',
    forClinics: '병원 관계자용',
    claimTitle: '무료 프로필 인증',
    claimNow: '지금 신청하기',
  },
  zh: {
    eyebrow: '健康指南',
    heroTitle: '为您的家庭编写的就医与健康指南',
    heroSub: '专为在美华人、越南裔与韩裔家庭打造',
    allArticles: '全部文章',
    quickInsights: '健康快讯',
    inDepthGuides: '深度指南',
    featuredStory: '精选文章',
    noArticles: '暂无已发布文章。',
    topics: '主题',
    allTopics: '全部主题',
    latestInsights: '最新健康资讯',
    latestInsightsSub: '面向患者与家人的实用医疗读物',
    guidesTitle: '深度就医指南',
    guidesSub: '从医保报销到预防筛查的详细步骤',
    closingTitle: '准备好寻找能用母语沟通的医生了吗？',
    forClinics: '诊所入驻',
    claimTitle: '免费认领诊所主页',
    claimNow: '立即认领',
  },
};

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
  const [locale, latestInsights, latestGuides, articleTags] = await Promise.all([
    getServerLocale(),
    selectedMode === 'guide' ? Promise.resolve([]) : getPublishedArticlesByMode('insight', filters, articleLimit),
    selectedMode === 'insight' ? Promise.resolve([]) : getPublishedArticlesByMode('guide', filters, articleLimit),
    getArticleTags(),
  ]);
  const copy = INSIGHTS_COPY[locale] ?? INSIGHTS_COPY.en;
  const catFilters = [
    { label: copy.allArticles, slug: null },
    { label: copy.quickInsights, slug: 'insight' },
    { label: copy.inDepthGuides, slug: 'guide' },
  ];

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
          <Caption>{copy.eyebrow}</Caption>
          <div>
            <Display as="h1">{copy.heroTitle}</Display>
            <Caption className="mt-5 opacity-75">{copy.heroSub}</Caption>
            <nav className="mt-7 flex flex-wrap gap-1.5" aria-label="Article type">
              {catFilters.map((filter) => {
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
              {copy.featuredStory}
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
            <Caption>{copy.noArticles}</Caption>
          </Tile>
        )}
      </Grid>

      {/* Topics */}
      <Tile tone="stone" className="py-4 md:flex md:items-center md:gap-4 md:px-7 md:py-5">
        <span className="block px-4 text-xs font-semibold uppercase tracking-widest opacity-55 md:shrink-0 md:px-0">{copy.topics}</span>
        <nav
          className="mt-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mt-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
          aria-label="Filter by topic"
        >
          {[{ label: copy.allTopics, slug: '' }, ...topics].map((topic) => {
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
          title={copy.latestInsights}
          description={copy.latestInsightsSub}
          articles={latestInsights}
          viewAllHref={categoryHref('insights')}
          showAll={Boolean(categorySlug || tagSlug)}
        />
      )}

      {selectedMode !== 'insight' && (
        <ArticleSection
          title={copy.guidesTitle}
          description={copy.guidesSub}
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
                {copy.closingTitle}
              </h2>
            </div>
            <ArrowCircle light />
          </div>
        </Link>
        <Tile tone="mint" className={`flex min-h-[16rem] flex-col justify-between gap-6 ${pad}`}>
          <div>
            <Caption className="text-[#024E44]">{copy.forClinics}</Caption>
            <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">{copy.claimTitle}</h3>
          </div>
          <Pill href="/claim" className="self-start">{copy.claimNow}</Pill>
        </Tile>
      </Grid>
    </Page>
  );
}
