import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArticleProgressSidebar,
  type ArticleOutlineItem,
} from '@/components/insights/article-progress-sidebar';
import { ArticleImage } from '@/components/insights/article-image';
import { getSafeArticleImageSrc } from '@/lib/article-image';
import {
  getArticleBySlug,
  getPublishedArticleSlugs,
  getRelatedArticles,
} from '@/services/article-service';
import type { Article } from '@/types/database';
import Link from 'next/link';

interface ArticlePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const slugs = await getPublishedArticleSlugs();

  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) return { title: 'Article Not Found' };

  const imageSrc =
    getSafeArticleImageSrc(article.seo_meta.images?.[0]) ||
    getSafeArticleImageSrc(article.seo_meta.og_image);

  return {
    title: `${article.title} | Asian Health Hub`,
    description: article.excerpt || article.seo_meta.description,
    openGraph: {
      title: article.title,
      description: article.excerpt || '',
      images: imageSrc ? [{ url: imageSrc }] : [],
    },
  };
}

function formatDate(date: string | null) {
  if (!date) return 'Recently';

  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ShareRow() {
  const links = ['x', 'in', 'f', 'mail'];

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      <span>Share:</span>
      <div className="flex items-center gap-2">
        {links.map((item) => (
          <span
            key={item}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-[10px] font-semibold uppercase text-gray-700"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function NewsletterInline() {
  return (
    <aside className="my-10 rounded-lg bg-[var(--ahh-blue)] px-6 py-6 text-center text-white">
      <h2 className="text-lg font-semibold">AHH Pulse Newsletter</h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-blue-100">
        Monthly healthcare guides, clinic spotlights, and practical tips for Asian American patients.
      </p>
      <div className="mx-auto mt-4 flex max-w-sm items-center rounded-full bg-white p-1">
        <span className="flex-1 px-4 text-left text-xs text-gray-400">Enter your email</span>
        <span className="rounded-full bg-[var(--ahh-blue)] px-4 py-2 text-xs font-semibold text-white">
          Subscribe
        </span>
      </div>
    </aside>
  );
}

function textFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join('');
  return '';
}

function slugifyHeading(text: string) {
  const ascii = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

  return (
    ascii
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}

function extractOutline(content: string): ArticleOutlineItem[] {
  return content
    .split('\n')
    .map((line) => {
      const match = line.match(/^(##|###)\s+(.+)$/);
      if (!match) return null;

      const title = match[2].replace(/[#*_`]/g, '').trim();
      if (!title) return null;

      return {
        id: slugifyHeading(title),
        title,
        level: match[1] === '##' ? 2 : 3,
      } satisfies ArticleOutlineItem;
    })
    .filter((item): item is ArticleOutlineItem => Boolean(item));
}

function countWords(content: string) {
  const plainText = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_`|~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return plainText ? plainText.split(' ').length : 0;
}

function createMarkdownComponents() {
  return {
    h1: ({ children }: { children?: ReactNode }) => (
      <h2
        id={slugifyHeading(textFromNode(children))}
        className="scroll-mt-24 text-2xl font-semibold leading-snug text-gray-950"
      >
        {children}
      </h2>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
      <h2
        id={slugifyHeading(textFromNode(children))}
        className="scroll-mt-24 pt-4 text-2xl font-semibold leading-snug text-gray-950"
      >
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
      <h3
        id={slugifyHeading(textFromNode(children))}
        className="scroll-mt-24 pt-2 text-lg font-semibold leading-snug text-gray-950"
      >
        {children}
      </h3>
    ),
    p: ({ children }: { children?: ReactNode }) => (
      <p className="text-[15px] leading-8 text-gray-700">{children}</p>
    ),
    ul: ({ children }: { children?: ReactNode }) => (
      <ul className="my-5 ml-5 list-disc space-y-2">{children}</ul>
    ),
    ol: ({ children }: { children?: ReactNode }) => (
      <ol className="my-5 ml-5 list-decimal space-y-2">{children}</ol>
    ),
    li: ({ children }: { children?: ReactNode }) => (
      <li className="pl-1 text-[15px] leading-7 text-gray-700">{children}</li>
    ),
    table: ({ children }: { children?: ReactNode }) => (
      <div className="my-8 overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="w-full border-collapse text-left text-sm">{children}</table>
      </div>
    ),
    th: ({ children }: { children?: ReactNode }) => (
      <th className="border-b border-blue-700 bg-[var(--ahh-blue)] px-4 py-3 font-semibold text-white">
        {children}
      </th>
    ),
    td: ({ children }: { children?: ReactNode }) => (
      <td className="border-b border-gray-200 px-4 py-3">{children}</td>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className="my-8 rounded-lg border-l-4 border-[var(--ahh-blue)] bg-blue-50 px-6 py-5 text-base leading-8 text-gray-700">
        {children}
      </blockquote>
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
      <a
        href={href}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noreferrer' : undefined}
        className="font-medium text-[var(--ahh-blue)] underline underline-offset-4"
      >
        {children}
      </a>
    ),
  };
}

function normalizeTitle(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedentMarkdown(content: string) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const indentedLines = lines.filter((line) => line.trim());
  const commonIndent = Math.min(
    ...indentedLines.map((line) => line.match(/^\s*/)?.[0].length || 0),
  );

  if (!Number.isFinite(commonIndent) || commonIndent === 0) {
    return lines.join('\n').trim();
  }

  return lines.map((line) => line.slice(commonIndent)).join('\n').trim();
}

function prepareArticleContent(content: string, title: string) {
  const normalizedTitle = normalizeTitle(title);
  const lines = dedentMarkdown(content)
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      const normalizedLine = normalizeTitle(trimmed.replace(/^#+\s*/, ''));

      if (!trimmed) return true;
      if (trimmed.startsWith('# ') && normalizedLine === normalizedTitle) return false;
      if (normalizedLine === `${normalizedTitle} illustration`) return false;

      return true;
    });

  return lines.join('\n').trim();
}

function ArticleMarkdownWithImages({
  preparedContent,
  imageSources,
  title,
}: {
  preparedContent: string;
  imageSources: string[];
  title: string;
}) {
  const sections = preparedContent.split(/(?=^##\s+)/m).filter((section) => section.trim());
  const imageSlots = imageSources.slice(0, 2);
  const markdownComponents = createMarkdownComponents();

  if (sections.length === 0) {
    return null;
  }

  const firstImageAfterIndex = sections.length > 1 ? 0 : -1;
  const secondImageAfterIndex = sections.length > 3 ? Math.floor(sections.length / 2) : 1;

  return (
    <>
      {sections.map((section, index) => (
        <div key={`${index}-${section.slice(0, 20)}`} className="space-y-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {section}
          </ReactMarkdown>

          {imageSlots[0] && index === firstImageAfterIndex && (
            <figure className="my-10 overflow-hidden rounded-lg bg-gray-100">
              <ArticleImage
                src={imageSlots[0]}
                alt={`${title} illustration`}
                className="aspect-[16/7]"
                iconSize={92}
              />
            </figure>
          )}

          {imageSlots[1] && index === secondImageAfterIndex && (
            <figure className="my-10 overflow-hidden rounded-lg bg-gray-100">
              <ArticleImage
                src={imageSlots[1]}
                alt={`${title} supporting illustration`}
                className="aspect-[16/7]"
                iconSize={92}
              />
            </figure>
          )}
        </div>
      ))}
    </>
  );
}

function RelatedGuides({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null;

  return (
    <section className="bg-gray-50 py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-950">Related Guides</h2>
            <p className="mt-2 max-w-2xl text-sm text-gray-500">
              Explore similar guides for Vietnamese and Korean patients navigating the US healthcare system.
            </p>
          </div>
          <Link
            href="/insights"
            className="hidden rounded-full border border-[var(--ahh-blue)] px-4 py-2 text-xs font-medium text-[var(--ahh-blue)] hover:bg-blue-50 sm:inline-flex"
          >
            See all insights &rarr;
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {articles.slice(0, 3).map((article) => (
            <Link
              key={article.id}
              href={`/insights/${article.slug}`}
              className="group overflow-hidden rounded-lg border border-white bg-white shadow-sm"
            >
              <ArticleImage
                src={article.seo_meta.og_image}
                alt={article.title}
                className="aspect-[16/9]"
              />
              <div className="p-4">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-950 group-hover:text-[var(--ahh-blue)]">
                  {article.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function ArticleDetailPage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  if (article.slug !== decodedSlug) {
    redirect(`/insights/${article.slug}`);
  }

  const relatedArticles = await getRelatedArticles(article);
  const articleImages = article.seo_meta.images || [];
  const heroImageSrc = articleImages[0] || article.seo_meta.og_image;
  const inlineImageSrc = articleImages[1] || null;
  const safeImageSrc = getSafeArticleImageSrc(heroImageSrc);
  const safeInlineImageSrc = getSafeArticleImageSrc(inlineImageSrc);
  const contentImageSources = [safeImageSrc, safeInlineImageSrc].filter((src): src is string => Boolean(src));
  const preparedContent = prepareArticleContent(article.content, article.title);
  const outline = extractOutline(preparedContent);
  const wordCount = countWords(preparedContent);
  const readMinutes = Math.max(1, Math.ceil(wordCount / 220));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt || article.seo_meta.description || undefined,
    image: safeImageSrc ? [safeImageSrc] : undefined,
    author: {
      '@type': 'Organization',
      name: article.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Asian Health Hub',
    },
    datePublished: article.published_at || article.created_at,
    dateModified: article.updated_at,
  };

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="bg-white">
        <section className="px-2 pt-4 sm:px-4">
          <div className="mx-auto max-w-[1240px] rounded-xl bg-[var(--ahh-blue)] px-7 py-10 sm:px-12 lg:px-16">
            <div className="grid items-center gap-8 lg:grid-cols-[1fr_280px]">
              <div className="max-w-3xl">
                <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                  {article.title}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-blue-100">
                  {article.excerpt || article.seo_meta.description || 'A practical guide for Asian American patients navigating care with confidence.'}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-blue-100">
                  <span className="rounded-full border border-white/35 px-3 py-1">
                    {article.category || 'Guide'}
                  </span>
                  <span className="rounded-full border border-white/35 px-3 py-1">
                    {article.tags[0] || 'Community Health'}
                  </span>
                  <span className="px-1 py-1">{formatDate(article.published_at)}</span>
                </div>
              </div>
              <ArticleImage
                src={heroImageSrc}
                alt={article.title}
                className="hidden aspect-[4/3] rounded-xl bg-white/90 p-0 lg:block"
                iconSize={72}
              />
            </div>
          </div>
        </section>

        <article className="mx-auto grid max-w-[1180px] gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,760px)_280px] lg:px-8">
          <div>
            <ShareRow />

            <div id="article-content" className="mt-8 space-y-6 text-sm leading-7 text-gray-700">
              <ArticleMarkdownWithImages
                preparedContent={preparedContent}
                imageSources={contentImageSources}
                title={article.title}
              />
            </div>

            <NewsletterInline />

            {article.tags.length > 0 && (
              <div className="mt-10 flex flex-wrap gap-2 border-t border-gray-100 pt-6">
                {article.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <ArticleProgressSidebar outline={outline} readMinutes={readMinutes} wordCount={wordCount} />
        </article>

        <RelatedGuides articles={relatedArticles} />
      </main>
    </>
  );
}
