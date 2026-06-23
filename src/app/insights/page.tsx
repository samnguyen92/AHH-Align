import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Calendar } from 'lucide-react';
import { ArticleImage } from '@/components/insights/article-image';
import {
  getArticleTags,
  getPublishedArticlesByMode,
  slugifyArticleCategory,
} from '@/services/article-service';
import type { Article } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Health Insights & Guides | Asian Health Hub',
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
  { label: 'All', slug: null },
  { label: 'Insight', slug: 'insight' },
  { label: 'Guide', slug: 'guide' },
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

function tagToneClass(tag: string) {
  const tones = [
    'border-[var(--ahh-lime)] bg-[var(--ahh-lime)] text-[var(--ahh-deep-teal)]',
    'border-[var(--ahh-soft-yellow)] bg-[var(--ahh-soft-yellow)] text-[var(--ahh-ink)]',
    'border-[var(--ahh-sage-green)] bg-[var(--ahh-sage-green)] text-[var(--ahh-ink)]',
    'border-[var(--ahh-blush-pink)] bg-[var(--ahh-blush-pink)] text-[var(--ahh-ink)]',
    'border-[var(--ahh-mist)] bg-[var(--ahh-mist)] text-[var(--ahh-deep-teal)]',
  ];
  const hash = Array.from(tag).reduce((total, char) => total + char.charCodeAt(0), 0);

  return tones[hash % tones.length];
}

function ArticleMeta({ article }: { article: Article }) {
  const tags = article.tags.length > 0 ? article.tags.slice(0, 2) : ['Community Health'];

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`rounded-full border px-2.5 py-1 font-medium ${tagToneClass(tag)}`}
        >
          {tag}
        </span>
      ))}
      <span className="inline-flex items-center gap-1 px-1 py-1 text-[var(--ahh-muted)]">
        <Calendar className="h-3 w-3 text-[var(--ahh-deep-teal)]" />
        {formatDate(article.published_at)}
      </span>
    </div>
  );
}

function ReadMoreLabel() {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ahh-deep-teal)]">
      Read more
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </span>
  );
}

function FeaturedArticleCard({ article }: { article?: Article }) {
  if (!article) {
    return (
      <div className="brand-card p-8 text-sm text-[var(--ahh-muted)]">
        No published articles yet.
      </div>
    );
  }

  return (
    <Link
      href={`/insights/${article.slug}`}
      className="brand-card group grid h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[var(--ahh-shadow)] md:grid-cols-[1.05fr_0.95fr]"
    >
      <ArticleImage
        src={article.seo_meta.og_image}
        alt={article.title}
        className="h-72 w-full md:h-full md:min-h-[420px]"
      />
      <div className="flex min-h-[360px] flex-col justify-center space-y-4 p-6 sm:p-8">
        <ArticleMeta article={article} />
        <h3 className="text-xl font-semibold leading-snug text-[var(--ahh-ink)] group-hover:text-[var(--ahh-deep-teal)]">
          {article.title}
        </h3>
        <p className="line-clamp-4 text-sm leading-6 text-[var(--ahh-muted)]">
          {article.excerpt || 'Read practical healthcare guidance for Asian American patients and families.'}
        </p>
        <div className="pt-1">
          <span className="brand-button inline-flex gap-2 px-4 py-2 text-sm">
            Read Full Article
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function SecondaryTopArticleCard({ article }: { article: Article }) {
  return (
    <Link
      href={`/insights/${article.slug}`}
      className="brand-card group grid h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[var(--ahh-shadow)] sm:grid-cols-[0.9fr_1fr]"
    >
      <ArticleImage
        src={article.seo_meta.og_image}
        alt={article.title}
        className="h-56 w-full sm:h-full sm:min-h-[210px]"
      />
      <div className="flex min-w-0 flex-col justify-center gap-2 p-4">
        <ArticleMeta article={article} />
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--ahh-ink)] group-hover:text-[var(--ahh-deep-teal)]">
          {article.title}
        </h3>
        <p className="line-clamp-2 text-xs leading-5 text-[var(--ahh-muted)]">
          {article.excerpt || 'Short, useful healthcare context for choosing care with confidence.'}
        </p>
        <span className="mt-1 inline-flex h-8 w-8 items-center justify-center self-end rounded-full bg-[var(--ahh-mist)] text-[var(--ahh-deep-teal)] transition group-hover:bg-[var(--ahh-deep-teal)] group-hover:text-white">
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function CompactArticleCard({ article }: { article: Article }) {
  return (
    <Link
      href={`/insights/${article.slug}`}
      className="brand-card group flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[var(--ahh-shadow)]"
    >
      <ArticleImage
        src={article.seo_meta.og_image}
        alt={article.title}
        className="aspect-[16/9] w-full"
      />
      <div className="flex flex-1 flex-col space-y-3 p-5">
        <ArticleMeta article={article} />
        <h3 className="line-clamp-3 text-base font-semibold leading-snug text-[var(--ahh-ink)] group-hover:text-[var(--ahh-deep-teal)]">
          {article.title}
        </h3>
        <p className="line-clamp-3 text-sm leading-6 text-[var(--ahh-muted)]">
          {article.excerpt || 'Short, useful healthcare context for choosing care with confidence.'}
        </p>
        <div className="mt-auto pt-1">
          <ReadMoreLabel />
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
}: {
  title: string;
  description: string;
  articles: Article[];
  viewAllHref: string;
  showAll?: boolean;
}) {
  const [featured, ...rest] = articles;
  const topArticles = rest.slice(0, 2);
  const compact = showAll ? rest.slice(2) : rest.slice(2, 6);

  return (
    <section className="home-section rounded-[16px] bg-white px-5 py-16 sm:px-10 lg:px-20 lg:py-[88px]">
      <div className="mb-7">
        <div>
          <h2 className="brand-heading-2">{title}</h2>
          <p className="brand-body-copy mt-3 max-w-2xl">{description}</p>
        </div>
      </div>

      <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,2.1fr)_minmax(360px,1fr)]">
        <div className="h-full">
          <FeaturedArticleCard article={featured} />
        </div>
        <div className="grid h-full gap-6 xl:grid-rows-2">
          {topArticles.map((article) => (
            <SecondaryTopArticleCard key={article.id} article={article} />
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {compact.map((article) => (
          <CompactArticleCard key={article.id} article={article} />
        ))}
      </div>

      <div className="mt-7 flex justify-center">
        <Link
          href={viewAllHref}
          className="brand-button-ghost inline-flex h-10 items-center gap-3 px-6 text-sm"
        >
          View all articles
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
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

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tag?: string }>;
}) {
  const { category, tag } = await searchParams;
  const categorySlug = category ? slugifyArticleCategory(category) : undefined;
  const tagSlug = tag ? slugifyArticleCategory(tag) : undefined;
  const selectedMode = categorySlug === 'guide' || categorySlug === 'guides' || categorySlug === 'in-depth-guides'
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
    .map((topic) => ({ label: topic, slug: slugifyArticleCategory(topic) }))
    .filter((topic) => topic.slug && !isModeCategory(topic.slug))
    .slice(0, 8);

  return (
    <main className="bg-[#92C7AD] px-[10px] pb-[10px]">
      <div className="home-shell">
      <section className="pt-0">
        <div className="brand-hero px-7 pb-14 pt-28 sm:px-12 lg:px-20 lg:pt-32">
          <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1fr_280px]">
            <div className="max-w-3xl">
              <h1 className="brand-heading-display text-white">
                Health Insights for Asian American Patients
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/72">
                Practical health articles and in-depth guides tailored to Vietnamese and Korean American communities navigating the US healthcare system and finding the right clinic.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {CATEGORY_FILTERS.map((filter) => (
                  <Link
                    key={filter.label}
                    href={filter.slug ? categoryHref(filter.slug) : '/insights'}
                    className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
                      (!filter.slug && !categorySlug && !tagSlug) || filter.slug === selectedMode
                        ? 'border-[var(--ahh-lime)] bg-[var(--ahh-lime)] text-[var(--ahh-deep-teal)]'
                        : 'border-white/40 text-white hover:bg-white hover:text-[var(--ahh-deep-teal)]'
                    }`}
                  >
                    {filter.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="hidden overflow-hidden rounded-[var(--ahh-radius-sm)] bg-white p-4 shadow-sm lg:block">
              <ArticleImage
                src={heroArticle?.seo_meta.og_image}
                alt={heroArticle?.title || 'Health guide illustration'}
                className="h-48 w-full rounded-[var(--ahh-radius-sm)]"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="home-section relative z-10 -mt-8 rounded-[16px] bg-[var(--ahh-mist-2)] px-5 py-10 sm:px-10 lg:px-20">
        <div className="brand-card p-7">
          <h2 className="text-base font-semibold text-[var(--ahh-ink)]">Hot Topic</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/insights"
              className={`rounded-full px-4 py-2 text-xs font-medium ${
                !categorySlug && !tagSlug ? 'bg-[var(--ahh-deep-teal)] text-white' : 'border border-[var(--ahh-border)] text-[var(--ahh-muted)]'
              }`}
            >
              All
            </Link>
            {topics.map((topic) => (
              <Link
                key={topic.slug}
                href={tagHref(topic.slug)}
                className={`rounded-full border px-4 py-2 text-xs font-medium capitalize transition ${
                  tagSlug === topic.slug
                    ? 'border-[var(--ahh-deep-teal)] bg-[var(--ahh-deep-teal)] text-white'
                    : 'border-[var(--ahh-border)] text-[var(--ahh-muted)] hover:border-[var(--ahh-deep-teal)] hover:text-[var(--ahh-deep-teal)]'
                }`}
              >
                {topic.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-[10px]">
        {selectedMode !== 'guide' && (
          <ArticleSection
            title="Latest Insights"
            description="Choose short articles for quick tips and detailed healthcare information."
            articles={latestInsights}
            viewAllHref={categoryHref('insights')}
            showAll={Boolean(categorySlug || tagSlug)}
          />
        )}

        {selectedMode !== 'insight' && (
          <ArticleSection
            title="Latest In-Depth Guides"
            description="Long-form healthcare guides that explain important topics in more detail, from finding the right clinic to preparing for care."
            articles={latestGuides}
            viewAllHref={categoryHref('guides')}
            showAll={Boolean(categorySlug || tagSlug)}
          />
        )}
      </div>
      </div>
    </main>
  );
}
