import { Metadata } from 'next';
import Link from 'next/link';
import { ArticleImage } from '@/components/insights/article-image';
import { ParallaxImage, Reveal, SplitTitle } from '@/components/lg/motion';
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

function ArticleMetaRow({
  article,
  featured = false,
}: {
  article: Article;
  featured?: boolean;
}) {
  const primaryTag = article.tags[0] || article.category || 'Community Health';
  return (
    <div className="lg-ins-meta">
      <span className={`lg-ins-tag ${featured ? 'lg-ins-tag--solid' : ''}`}>
        <span className="dot" aria-hidden="true" />
        {primaryTag}
      </span>
      <span className="lg-ins-date">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
        {formatDate(article.published_at)}
      </span>
    </div>
  );
}

function FeaturedArticleCard({ article }: { article?: Article }) {
  if (!article) {
    return (
      <div className="rounded-[22px] bg-white p-8 text-sm text-[#5A7A70] border border-[#024E44]/12">
        No published articles yet.
      </div>
    );
  }

  return (
    <Link href={`/insights/${article.slug}`} className="lg-ins-featured">
      <div className="lg-ins-featured-media">
        <ArticleImage
          src={article.seo_meta.og_image}
          alt={article.title}
          className="h-full w-full"
        />
      </div>
      <div className="lg-ins-featured-body">
        <ArticleMetaRow article={article} featured />
        <h3 className="line-clamp-3">{article.title}</h3>
        <p className="line-clamp-4">
          {article.excerpt || 'Read practical healthcare guidance for Asian American patients and families.'}
        </p>
        <div className="mt-auto pt-3">
          <span className="lg-ins-btn">
            <span>Read Full Guide</span>
            <span className="ico" aria-hidden="true">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function SecondaryTopArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/insights/${article.slug}`} className="lg-ins-horizontal">
      <div className="lg-ins-horizontal-media">
        <ArticleImage
          src={article.seo_meta.og_image}
          alt={article.title}
          className="h-full w-full"
        />
      </div>
      <div className="lg-ins-horizontal-body">
        <ArticleMetaRow article={article} />
        <h3 className="line-clamp-2">{article.title}</h3>
        <p className="line-clamp-2">
          {article.excerpt || 'Short, useful healthcare context for choosing care with confidence.'}
        </p>
        <div className="lg-ins-horizontal-foot">
          <span>Read article</span>
          <span className="circle" aria-hidden="true">→</span>
        </div>
      </div>
    </Link>
  );
}

function CompactArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/insights/${article.slug}`} className="lg-card lg-ins-compact">
      <div className="ph">
        <ArticleImage
          src={article.seo_meta.og_image}
          alt={article.title}
          className="h-full w-full"
        />
      </div>
      <div className="bd">
        <ArticleMetaRow article={article} />
        <h3 className="line-clamp-2">{article.title}</h3>
        <p className="line-clamp-3">
          {article.excerpt || 'Practical healthcare context for choosing care with confidence.'}
        </p>
        <div className="lg-ins-compact-foot">
          <span>Read article</span>
          <span className="circle" aria-hidden="true">→</span>
        </div>
      </div>
    </Link>
  );
}

function ArticleSection({
  eyebrow,
  title,
  tintFrom = 2,
  description,
  articles,
  viewAllHref,
  showAll = false,
  variant = 'paper',
}: {
  eyebrow: string;
  title: string;
  tintFrom?: number;
  description: string;
  articles: Article[];
  viewAllHref: string;
  showAll?: boolean;
  variant?: 'paper' | 'white';
}) {
  const [featured, ...rest] = articles;
  const topArticles = rest.slice(0, 2);
  const compact = showAll ? rest.slice(2) : rest.slice(2, 6);

  return (
    <section className={`lg-section ${variant === 'white' ? 'lg-section--white' : ''}`}>
      <div className="lg-wrap">
        <div className="lg-ins-sec-head">
          <div>
            <span className="lg-ins-kicker">{eyebrow}</span>
            <SplitTitle as="h2" text={title} tintFrom={tintFrom} />
            <p className="lg-ins-sub">{description}</p>
          </div>
          {!showAll && (
            <Link href={viewAllHref} className="lg-ins-viewall">
              <span>View all articles</span>
              <span className="arr" aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        <div className="lg-ins-lead-grid">
          <Reveal className="lg-fill">
            <FeaturedArticleCard article={featured} />
          </Reveal>
          {topArticles.length > 0 && (
            <div className="lg-ins-side-stack">
              {topArticles.map((article, i) => (
                <Reveal key={article.id} delay={0.08 * (i + 1)} className="lg-fill">
                  <SecondaryTopArticleCard article={article} />
                </Reveal>
              ))}
            </div>
          )}
        </div>

        {compact.length > 0 && (
          <div className="lg-ins-grid4">
            {compact.map((article, i) => (
              <Reveal key={article.id} delay={(i % 4) * 0.06} className="lg-fill">
                <CompactArticleCard article={article} />
              </Reveal>
            ))}
          </div>
        )}
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
    .map((topic) => ({ label: topic, slug: slugifyArticleCategory(topic) }))
    .filter((topic) => topic.slug && !isModeCategory(topic.slug))
    .slice(0, 10);

  return (
    <div className="lg">
      {/* ===== Insights Hero ===== */}
      <header className="lg-ins-hero">
        <div className="lg-wrap">
          <div className="grid">
            <div>
              <span className="lg-dir-eyebrow">Community Health Journal</span>
              <SplitTitle
                as="h1"
                text="Evidence-based health guides for Asian American families."
                tintFrom={4}
              />
              <p className="lead">
                Practical medical articles, preventive checklists, and in-depth care guides tailored to Vietnamese and Korean communities navigating the US healthcare system.
              </p>

              <div className="lg-ins-modes">
                {CATEGORY_FILTERS.map((filter) => {
                  const isActive =
                    (!filter.slug && !categorySlug && !tagSlug) || filter.slug === selectedMode;
                  return (
                    <Link
                      key={filter.label}
                      href={filter.slug ? categoryHref(filter.slug) : '/insights'}
                      className={`lg-ins-mode ${isActive ? 'is-active' : ''}`}
                    >
                      {filter.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {heroArticle && (
              <Reveal delay={0.1}>
                <Link href={`/insights/${heroArticle.slug}`} className="lg-ins-spotlight">
                  <div className="lg-ins-spotlight-media">
                    <ArticleImage
                      src={heroArticle.seo_meta.og_image}
                      alt={heroArticle.title}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="lg-ins-spotlight-body">
                    <span className="lg-ins-spotlight-kicker">Featured Story</span>
                    <h3 className="line-clamp-2">{heroArticle.title}</h3>
                    <p className="line-clamp-2">
                      {heroArticle.excerpt || 'Read our latest community guide for navigating bilingual care.'}
                    </p>
                  </div>
                </Link>
              </Reveal>
            )}
          </div>
        </div>
      </header>

      {/* ===== Topic Filter Bar ===== */}
      <section className="lg-ins-topics" aria-label="Filter by topic">
        <div className="lg-wrap">
          <div className="lg-ins-topics-row">
            <span className="lg-ins-topics-lbl">Hot Topics:</span>
            <Link
              href="/insights"
              className={`lg-topic-pill ${!categorySlug && !tagSlug ? 'is-active' : ''}`}
            >
              All Topics
            </Link>
            {topics.map((topic) => (
              <Link
                key={topic.slug}
                href={tagHref(topic.slug)}
                className={`lg-topic-pill ${tagSlug === topic.slug ? 'is-active' : ''}`}
              >
                {topic.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Editorial Sections ===== */}
      {selectedMode !== 'guide' && (
        <ArticleSection
          eyebrow="Community Updates & Tips"
          title="Latest Health Insights"
          tintFrom={2}
          description="Concise, actionable medical guidance and local healthcare updates for patients and caregivers."
          articles={latestInsights}
          viewAllHref={categoryHref('insights')}
          showAll={Boolean(categorySlug || tagSlug)}
          variant="paper"
        />
      )}

      {selectedMode !== 'insight' && (
        <ArticleSection
          eyebrow="Step-by-Step Playbooks"
          title="In-Depth Patient Guides"
          tintFrom={2}
          description="Comprehensive guides covering USCIS medical exams, insurance coverage, preventive screenings, and choosing the right specialist."
          articles={latestGuides}
          viewAllHref={categoryHref('guides')}
          showAll={Boolean(categorySlug || tagSlug)}
          variant="white"
        />
      )}

      {/* ===== Bottom Film CTA ===== */}
      <section className="lg-film">
        <div className="lg-wrap">
          <div className="lg-panel">
            <ParallaxImage src="/brand/lg/primary-care.jpg" alt="Doctor consultation" />
            <div className="copy">
              <span className="lg-eyebrow" style={{ color: 'var(--lg-lime)' }}>
                Put Knowledge Into Action
              </span>
              <SplitTitle
                as="h2"
                text="Ready to speak with a doctor in your language?"
                tintFrom={5}
              />
              <p>
                Browse verified clinics across the United States with Vietnamese, Korean, Mandarin, and Cantonese-speaking care teams.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <Link href="/search" className="lg-cta lg-cta--lime">
                  <span>Search the Directory</span>
                  <span className="arr" aria-hidden="true">→</span>
                </Link>
                <Link href="/claim" className="lg-cta lg-cta--line">
                  <span>Claim a Clinic Profile</span>
                  <span className="arr" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
