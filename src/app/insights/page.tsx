import { Metadata } from 'next';
import Link from 'next/link';
import { ArticleImage } from '@/components/insights/article-image';
import {
  getArticleCategories,
  getPublishedArticlesByMode,
  slugifyArticleCategory,
} from '@/services/article-service';
import type { Article } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Health Insights & Guides | Asian Health Hub',
  description: 'Expert medical guides, healthcare tips, and community health news for the Asian community.',
};

const DEFAULT_TOPICS = [
  'Primary Care',
  'Houston',
  'Dental',
  'USCIS Examination',
  'Vaccination',
  'Children Care',
  'Korean',
];

function categoryHref(categorySlug: string) {
  return `/insights?category=${categorySlug}`;
}

function formatDate(date: string | null) {
  if (!date) return 'Recently';

  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ArticleMeta({ article }: { article: Article }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-400">
      <span>{article.category || 'Guide'}</span>
      <span>{article.tags[0] || 'Community Health'}</span>
      <span className="inline-flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        {formatDate(article.published_at)}
      </span>
    </div>
  );
}

function FeaturedArticleCard({ article }: { article?: Article }) {
  if (!article) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-8 text-sm text-gray-500 shadow-lg shadow-gray-200/60">
        No published articles yet.
      </div>
    );
  }

  return (
    <Link
      href={`/insights/${article.slug}`}
      className="group flex h-full min-h-[440px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg shadow-gray-200/70 transition-all hover:-translate-y-0.5 hover:shadow-xl"
    >
      <ArticleImage
        src={article.seo_meta.og_image}
        alt={article.title}
        className="h-64 w-full shrink-0 sm:h-72"
      />
      <div className="flex flex-1 flex-col justify-end space-y-4 p-6 sm:p-7">
        <ArticleMeta article={article} />
        <h3 className="text-lg font-semibold leading-snug text-gray-950 group-hover:text-[var(--ahh-blue)]">
          {article.title}
        </h3>
        <p className="line-clamp-3 text-sm leading-6 text-gray-500">
          {article.excerpt || 'Read practical healthcare guidance for Asian American patients and families.'}
        </p>
      </div>
    </Link>
  );
}

function CompactArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/insights/${article.slug}`} className="group block">
      <div className="overflow-hidden rounded-lg bg-white">
        <ArticleImage
          src={article.seo_meta.og_image}
          alt={article.title}
          className="aspect-[16/9]"
        />
        <div className="space-y-2 pt-3">
          <ArticleMeta article={article} />
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-950 group-hover:text-[var(--ahh-blue)]">
            {article.title}
          </h3>
          <p className="line-clamp-3 text-xs leading-5 text-gray-500">
            {article.excerpt || 'Short, useful healthcare context for choosing care with confidence.'}
          </p>
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
  const compact = showAll ? rest : rest.slice(0, 4);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-950">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">{description}</p>
        </div>
        {!showAll && (
          <Link href={viewAllHref} className="hidden text-sm text-gray-700 hover:text-[var(--ahh-blue)] sm:inline-flex">
            View all &rarr;
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <FeaturedArticleCard article={featured} />
        <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2">
          {compact.map((article) => (
            <CompactArticleCard key={article.id} article={article} />
          ))}
        </div>
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
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const categorySlug = category ? slugifyArticleCategory(category) : undefined;
  const selectedMode = categorySlug === 'guide' || categorySlug === 'guides' || categorySlug === 'in-depth-guides'
    ? 'guide'
    : categorySlug === 'insight' || categorySlug === 'insights'
      ? 'insight'
      : null;
  const articleLimit = categorySlug ? 60 : 5;

  const [latestInsights, latestGuides, categories] = await Promise.all([
    selectedMode === 'guide' ? Promise.resolve([]) : getPublishedArticlesByMode('insight', categorySlug, articleLimit),
    selectedMode === 'insight' ? Promise.resolve([]) : getPublishedArticlesByMode('guide', categorySlug, articleLimit),
    getArticleCategories(),
  ]);

  const heroArticle = latestInsights[0] ?? latestGuides[0];
  const topics = [...new Set([...categories, ...DEFAULT_TOPICS])]
    .map((topic) => ({ label: topic, slug: slugifyArticleCategory(topic) }))
    .filter((topic) => topic.slug && !isModeCategory(topic.slug))
    .slice(0, 8);

  return (
    <main className="bg-white">
      <section className="px-2 pt-4 sm:px-4">
        <div className="mx-auto max-w-[1240px] rounded-2xl bg-[var(--ahh-blue)] px-7 py-14 sm:px-12 lg:px-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_280px]">
            <div className="max-w-3xl">
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                Health Insights for Asian American Patients
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-blue-100">
                Practical health articles and in-depth guides tailored to Vietnamese and Korean American communities navigating the US healthcare system and finding the right clinic.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {['All', 'Insights', 'Guides'].map((label) => (
                  <Link
                    key={label}
                    href={label === 'All' ? '/insights' : `/insights?category=${label.toLowerCase()}`}
                    className="rounded-full border border-white/40 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white hover:text-[var(--ahh-blue)]"
                  >
                    {label}
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
        <div className="rounded-xl bg-white p-7 shadow-xl shadow-gray-200/70">
          <h2 className="text-base font-semibold text-gray-950">Hot Topic</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/insights"
              className={`rounded-full px-4 py-2 text-xs font-medium ${
                !categorySlug ? 'bg-[var(--ahh-blue)] text-white' : 'border border-gray-200 text-gray-600'
              }`}
            >
              All
            </Link>
            {topics.map((topic) => (
              <Link
                key={topic.slug}
                href={categoryHref(topic.slug)}
                className={`rounded-full border px-4 py-2 text-xs font-medium capitalize transition ${
                  categorySlug === topic.slug
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
            showAll={Boolean(categorySlug)}
          />
        )}

        {selectedMode !== 'insight' && (
          <ArticleSection
            title="Latest In-Depth Guides"
            description="Long-form healthcare guides that explain important topics in more detail, from finding the right clinic to preparing for care."
            articles={latestGuides}
            viewAllHref={categoryHref('guides')}
            showAll={Boolean(categorySlug)}
          />
        )}
      </div>
    </main>
  );
}
