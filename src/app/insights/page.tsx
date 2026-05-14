import { Metadata } from 'next';
import Link from 'next/link';
import { ArticleImage } from '@/components/insights/article-image';
import { getPublishedArticles, getArticleCategories } from '@/services/article-service';
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
      className="group block overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg shadow-gray-200/70 transition-all hover:-translate-y-0.5 hover:shadow-xl"
    >
      <ArticleImage
        src={article.seo_meta.og_image}
        alt={article.title}
        className="aspect-[5/3]"
      />
      <div className="space-y-4 p-6">
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
}: {
  title: string;
  description: string;
  articles: Article[];
}) {
  const [featured, ...rest] = articles;
  const compact = rest.slice(0, 4);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-950">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">{description}</p>
        </div>
        <Link href="/insights" className="hidden text-sm text-gray-700 hover:text-[var(--ahh-blue)] sm:inline-flex">
          View all &rarr;
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
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

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const { category, page: pageStr } = await searchParams;
  const page = parseInt(pageStr || '1', 10);

  const [articlesData, categories] = await Promise.all([
    getPublishedArticles(category, page, 10),
    getArticleCategories(),
  ]);

  const articles = articlesData.data;
  const guideArticles = articles.filter((article) => {
    const text = `${article.category || ''} ${article.tags.join(' ')}`.toLowerCase();
    return text.includes('guide') || text.includes('uscis') || text.includes('insurance');
  });
  const latestGuides = guideArticles.length > 0 ? guideArticles : articles;
  const topics = [...new Set([...categories, ...DEFAULT_TOPICS])].slice(0, 8);

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
            <div className="hidden overflow-hidden rounded-xl bg-white/90 p-10 shadow-sm lg:block">
              <ArticleImage
                src={articles[0]?.seo_meta.og_image}
                alt={articles[0]?.title || 'Health guide illustration'}
                className="aspect-[16/9]"
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
                !category ? 'bg-[var(--ahh-blue)] text-white' : 'border border-gray-200 text-gray-600'
              }`}
            >
              All
            </Link>
            {topics.map((topic) => (
              <Link
                key={topic}
                href={`/insights?category=${encodeURIComponent(topic)}`}
                className={`rounded-full border px-4 py-2 text-xs font-medium capitalize transition ${
                  category === topic
                    ? 'border-[var(--ahh-blue)] bg-[var(--ahh-blue)] text-white'
                    : 'border-gray-200 text-gray-600 hover:border-[var(--ahh-blue)] hover:text-[var(--ahh-blue)]'
                }`}
              >
                {topic.replace('-', ' ')}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-20 py-12 sm:py-16">
        <ArticleSection
          title="Latest Insights"
          description="Choose short articles for quick tips and detailed healthcare information."
          articles={articles}
        />

        <ArticleSection
          title="Latest In-Depth Guides"
          description="Long-form healthcare guides that explain important topics in more detail, from finding the right clinic to preparing for care."
          articles={latestGuides}
        />
      </div>

      {(articlesData.hasMore || page > 1) && (
        <div className="mx-auto mb-16 flex max-w-6xl justify-center gap-4 px-4 sm:px-6 lg:px-8">
          {page > 1 && (
            <Link
              href={`/insights?page=${page - 1}${category ? `&category=${category}` : ''}`}
              className="rounded-lg border border-gray-200 bg-white px-6 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Previous
            </Link>
          )}
          {articlesData.hasMore && (
            <Link
              href={`/insights?page=${page + 1}${category ? `&category=${category}` : ''}`}
              className="rounded-lg bg-[var(--ahh-blue)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--ahh-blue-dark)]"
            >
              Next Page
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
