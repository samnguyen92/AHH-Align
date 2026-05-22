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
    'border-blue-100 bg-blue-50 text-blue-700',
    'border-emerald-100 bg-emerald-50 text-emerald-700',
    'border-violet-100 bg-violet-50 text-violet-700',
    'border-amber-100 bg-amber-50 text-amber-700',
    'border-rose-100 bg-rose-50 text-rose-700',
    'border-cyan-100 bg-cyan-50 text-cyan-700',
    'border-teal-100 bg-teal-50 text-teal-700',
    'border-indigo-100 bg-indigo-50 text-indigo-700',
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
      <span className="inline-flex items-center gap-1 px-1 py-1 text-gray-500">
        <Calendar className="h-3 w-3 text-[var(--ahh-blue)]" />
        {formatDate(article.published_at)}
      </span>
    </div>
  );
}

function ReadMoreLabel() {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ahh-blue)]">
      Read more
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </span>
  );
}

function FeaturedArticleCard({ article }: { article?: Article }) {
  if (!article) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-sm">
        No published articles yet.
      </div>
    );
  }

  return (
    <Link
      href={`/insights/${article.slug}`}
      className="group grid h-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg md:grid-cols-[1.05fr_0.95fr]"
    >
      <ArticleImage
        src={article.seo_meta.og_image}
        alt={article.title}
        className="h-72 w-full md:h-full md:min-h-[420px]"
      />
      <div className="flex min-h-[360px] flex-col justify-center space-y-4 p-6 sm:p-8">
        <ArticleMeta article={article} />
        <h3 className="text-xl font-semibold leading-snug text-gray-950 group-hover:text-[var(--ahh-blue)]">
          {article.title}
        </h3>
        <p className="line-clamp-4 text-sm leading-6 text-gray-600">
          {article.excerpt || 'Read practical healthcare guidance for Asian American patients and families.'}
        </p>
        <div className="pt-1">
          <span className="inline-flex items-center gap-2 rounded-md bg-[var(--ahh-blue)] px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-[var(--ahh-blue-dark)]">
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
      className="group grid h-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:grid-cols-[0.9fr_1fr]"
    >
      <ArticleImage
        src={article.seo_meta.og_image}
        alt={article.title}
        className="h-56 w-full sm:h-full sm:min-h-[210px]"
      />
      <div className="flex min-w-0 flex-col justify-center gap-2 p-4">
        <ArticleMeta article={article} />
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-950 group-hover:text-[var(--ahh-blue)]">
          {article.title}
        </h3>
        <p className="line-clamp-2 text-xs leading-5 text-gray-600">
          {article.excerpt || 'Short, useful healthcare context for choosing care with confidence.'}
        </p>
        <span className="mt-1 inline-flex h-8 w-8 items-center justify-center self-end rounded-full bg-blue-50 text-[var(--ahh-blue)] transition group-hover:bg-[var(--ahh-blue)] group-hover:text-white">
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
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <ArticleImage
        src={article.seo_meta.og_image}
        alt={article.title}
        className="aspect-[16/9] w-full"
      />
      <div className="flex flex-1 flex-col space-y-3 p-5">
        <ArticleMeta article={article} />
        <h3 className="line-clamp-3 text-base font-semibold leading-snug text-gray-950 group-hover:text-[var(--ahh-blue)]">
          {article.title}
        </h3>
        <p className="line-clamp-3 text-sm leading-6 text-gray-600">
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
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mb-7">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-950">{title}</h2>
          <p className="mt-3 max-w-2xl text-base leading-6 text-gray-500">{description}</p>
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
          className="inline-flex h-10 items-center gap-3 rounded-full border border-gray-200 bg-white px-6 text-sm font-semibold text-[var(--ahh-blue)] shadow-sm transition hover:border-[var(--ahh-blue)] hover:bg-blue-50"
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
    <main className="bg-white">
      <section className="px-2 pt-4 sm:px-4">
        <div className="brand-hero mx-auto max-w-[1240px] px-7 py-14 sm:px-12 lg:px-20">
          <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1fr_280px]">
            <div className="max-w-3xl">
              <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                Health Insights for Asian American Patients
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-white/72">
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
            <div className="hidden overflow-hidden rounded-xl bg-white/90 p-4 shadow-sm lg:block">
              <ArticleImage
                src={heroArticle?.seo_meta.og_image}
                alt={heroArticle?.title || 'Health guide illustration'}
                className="h-48 w-full rounded-lg"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-8 max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="brand-card rounded-lg p-7">
          <h2 className="text-base font-semibold text-[var(--ahh-ink)]">Hot Topic</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/insights"
              className={`rounded-full px-4 py-2 text-xs font-medium ${
                !categorySlug && !tagSlug ? 'bg-[var(--ahh-blue)] text-white' : 'border border-gray-200 text-gray-600'
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
                    ? 'border-[var(--ahh-blue)] bg-[var(--ahh-blue)] text-white'
                    : 'border-gray-200 text-gray-600 hover:border-[var(--ahh-blue)] hover:text-[var(--ahh-blue)]'
                }`}
              >
                {topic.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-20 py-12 sm:py-16">
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
    </main>
  );
}
