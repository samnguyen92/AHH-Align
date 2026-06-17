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
  getRelatedArticles,
} from '@/services/article-service';
import type { Article } from '@/types/database';
import { absoluteUrl } from '@/lib/site';
import { Mail } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface ArticlePageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    version?: string | string[];
  }>;
}

type ArticleVersionSnapshot = NonNullable<Article['seo_meta']['versions']>[number];

interface ArticleVersionView {
  version: number;
  label: string;
  isCurrent: boolean;
  title: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  savedAt: string | null;
  wordCount?: number;
  rewriteInstruction?: string | null;
  rewrittenAt?: string | null;
  seoMeta: Article['seo_meta'] | Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSeoString(seoMeta: ArticleVersionView['seoMeta'], key: string) {
  return asString((seoMeta as Record<string, unknown>)[key]);
}

function getSeoImages(seoMeta: ArticleVersionView['seoMeta']) {
  return asStringArray((seoMeta as Record<string, unknown>).images);
}

function getArticleCurrentVersion(article: Article) {
  const explicitVersion = asNumber(article.seo_meta.current_version);
  if (explicitVersion && explicitVersion > 0) return explicitVersion;

  const historicalVersions = (article.seo_meta.versions || [])
    .map((version) => asNumber(version.version))
    .filter((version): version is number => Boolean(version && version > 0));

  return historicalVersions.length > 0 ? Math.max(...historicalVersions) + 1 : 1;
}

function toHistoricalVersionView(article: Article, snapshot: ArticleVersionSnapshot): ArticleVersionView | null {
  const version = asNumber(snapshot.version);
  const content = asString(snapshot.content);

  if (!version || version < 1 || !content) {
    return null;
  }

  const seoMeta = snapshot.seo_meta || {};

  return {
    version,
    label: snapshot.label || `v${version}`,
    isCurrent: false,
    title: snapshot.title || article.title,
    excerpt: snapshot.excerpt ?? null,
    content,
    category: snapshot.category ?? article.category,
    tags: snapshot.tags || [],
    publishedAt: snapshot.published_at ?? article.published_at,
    updatedAt: snapshot.updated_at ?? null,
    savedAt: snapshot.saved_at || null,
    wordCount: snapshot.word_count,
    rewriteInstruction: snapshot.rewrite_instruction ?? null,
    rewrittenAt: snapshot.rewritten_at ?? null,
    seoMeta,
  };
}

function getArticleVersionViews(article: Article): ArticleVersionView[] {
  const currentVersion = getArticleCurrentVersion(article);
  const historicalViews = (article.seo_meta.versions || [])
    .map((snapshot) => toHistoricalVersionView(article, snapshot))
    .filter((snapshot): snapshot is ArticleVersionView => Boolean(snapshot));

  const currentView: ArticleVersionView = {
    version: currentVersion,
    label: article.seo_meta.version_label || `v${currentVersion}`,
    isCurrent: true,
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    category: article.category,
    tags: article.tags,
    publishedAt: article.published_at,
    updatedAt: article.updated_at,
    savedAt: article.updated_at,
    wordCount: countWords(article.content),
    rewriteInstruction: article.seo_meta.last_rewrite_instruction,
    rewrittenAt: article.seo_meta.last_rewritten_at,
    seoMeta: article.seo_meta,
  };

  const uniqueViews = new Map<number, ArticleVersionView>();
  for (const view of [...historicalViews, currentView]) {
    uniqueViews.set(view.version, view);
  }

  return Array.from(uniqueViews.values()).sort((a, b) => a.version - b.version);
}

function getRequestedVersion(searchParams?: Awaited<NonNullable<ArticlePageProps['searchParams']>>) {
  const rawVersion = Array.isArray(searchParams?.version)
    ? searchParams?.version[0]
    : searchParams?.version;
  const version = Number(rawVersion);

  return Number.isFinite(version) && version > 0 ? version : null;
}

function selectArticleVersion(article: Article, requestedVersion: number | null) {
  const versions = getArticleVersionViews(article);
  const currentView = versions.find((version) => version.isCurrent) || versions[versions.length - 1];
  const selectedView =
    requestedVersion === null
      ? currentView
      : versions.find((version) => version.version === requestedVersion) || currentView;

  return { versions, selectedView, currentView };
}

export async function generateMetadata({ params, searchParams }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const query = searchParams ? await searchParams : undefined;
  const article = await getArticleBySlug(slug);

  if (!article) return { title: 'Article Not Found' };

  const requestedVersion = getRequestedVersion(query);
  const { selectedView, currentView } = selectArticleVersion(article, requestedVersion);
  const imageList = getSeoImages(selectedView.seoMeta);
  const imageSrc =
    getSafeArticleImageSrc(imageList[0]) ||
    getSafeArticleImageSrc(getSeoString(selectedView.seoMeta, 'og_image'));
  const isHistoricalVersion = selectedView.version !== currentView.version;

  return {
    title: `${selectedView.title} | Asian Health Hub`,
    description: selectedView.excerpt || getSeoString(selectedView.seoMeta, 'description') || undefined,
    robots: isHistoricalVersion ? { index: false, follow: false } : undefined,
    openGraph: {
      title: selectedView.title,
      description: selectedView.excerpt || '',
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

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M18.244 2H21.6l-7.33 8.38L22.9 22h-6.754l-5.29-6.918L4.8 22H1.443l7.84-8.96L1 2h6.925l4.782 6.324L18.244 2Zm-1.178 17.953h1.86L6.914 3.94H4.92l12.146 16.013Z" />
    </svg>
  );
}

function LinkedInLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M20.447 20.452h-3.554v-5.568c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.447-2.136 2.942v5.663H9.351V9h3.414v1.561h.049c.476-.9 1.637-1.852 3.368-1.852 3.601 0 4.267 2.371 4.267 5.455v6.288ZM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124ZM7.115 20.452H3.556V9h3.559v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.226.792 24 1.771 24h20.451C23.2 24 24 23.226 24 22.271V1.729C24 .774 23.2 0 22.225 0Z" />
    </svg>
  );
}

function FacebookLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.438H7.078v-3.489h3.047V9.414c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97H15.83c-1.491 0-1.956.931-1.956 1.887v2.263h3.328l-.532 3.489h-2.796V24C19.612 23.094 24 18.1 24 12.073Z" />
    </svg>
  );
}

function ShareRow({ title, shareUrl }: { title: string; shareUrl: string }) {
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);
  const links = [
    {
      label: 'Share on X',
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      icon: <XLogo />,
    },
    {
      label: 'Share on LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      icon: <LinkedInLogo />,
    },
    {
      label: 'Share on Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: <FacebookLogo />,
    },
    {
      label: 'Share by email',
      href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`,
      icon: <Mail aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />,
    },
  ];

  return (
    <div className="flex items-center gap-3 text-xs text-[var(--ahh-muted)]">
      <span>Share:</span>
      <div className="flex items-center gap-2">
        {links.map((item) => (
          <a
            key={item.label}
            href={item.href}
            aria-label={item.label}
            target={item.href.startsWith('mailto:') ? undefined : '_blank'}
            rel={item.href.startsWith('mailto:') ? undefined : 'noreferrer'}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ahh-border)] text-[var(--ahh-ink)] transition hover:border-[var(--ahh-deep-teal)] hover:bg-[var(--ahh-mist)] hover:text-[var(--ahh-deep-teal)]"
          >
            {item.icon}
          </a>
        ))}
      </div>
    </div>
  );
}

function versionHref(slug: string, version: ArticleVersionView, currentVersion: number) {
  return version.version === currentVersion
    ? `/insights/${slug}`
    : `/insights/${slug}?version=${version.version}`;
}

function VersionSwitcher({
  slug,
  versions,
  selectedVersion,
  currentVersion,
}: {
  slug: string;
  versions: ArticleVersionView[];
  selectedVersion: ArticleVersionView;
  currentVersion: ArticleVersionView;
}) {
  if (versions.length <= 1) {
    return null;
  }

  return (
    <section className="brand-container pt-6">
      <div className="brand-card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="brand-caption font-semibold uppercase text-[var(--ahh-muted)]">Article versions</p>
            <p className="mt-1 text-sm text-[var(--ahh-ink)]">
              Viewing {selectedVersion.label}
              {selectedVersion.isCurrent ? ' (current)' : ` saved ${formatDate(selectedVersion.savedAt)}`}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {versions.map((version) => {
              const isSelected = version.version === selectedVersion.version;
              return (
                <Link
                  key={version.version}
                  href={versionHref(slug, version, currentVersion.version)}
                  className={[
                    'rounded-full border px-4 py-2 text-xs font-semibold transition',
                    isSelected
                      ? 'border-[var(--ahh-deep-teal)] bg-[var(--ahh-deep-teal)] text-white'
                      : 'border-[var(--ahh-border)] bg-white text-[var(--ahh-ink)] hover:border-[var(--ahh-deep-teal)] hover:text-[var(--ahh-deep-teal)]',
                  ].join(' ')}
                >
                  {version.label}
                  {version.isCurrent ? ' Current' : ''}
                </Link>
              );
            })}
          </div>
        </div>

        {!selectedVersion.isCurrent && (
          <div className="mt-4 grid gap-3 border-t border-[var(--ahh-border)] pt-4 text-xs text-[var(--ahh-muted)] sm:grid-cols-3">
            <span>Words: {(selectedVersion.wordCount || countWords(selectedVersion.content)).toLocaleString()}</span>
            <span>Saved: {formatDate(selectedVersion.savedAt)}</span>
            <span>Current: {currentVersion.label}</span>
          </div>
        )}

        {selectedVersion.rewriteInstruction && (
          <p className="mt-3 border-t border-[var(--ahh-border)] pt-3 text-xs leading-6 text-[var(--ahh-muted)]">
            Rewrite note: {selectedVersion.rewriteInstruction}
          </p>
        )}
      </div>
    </section>
  );
}

function NewsletterInline() {
  return (
    <aside className="article-newsletter-inline my-10 rounded-[var(--ahh-radius)] bg-[var(--ahh-deep-teal)] px-6 py-6 text-center text-white">
      <h2 className="text-lg font-semibold">AHH Pulse Newsletter</h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-white/70">
        Monthly healthcare guides, clinic spotlights, and practical tips for Asian American patients.
      </p>
      <div className="mx-auto mt-4 flex max-w-sm items-center rounded-full bg-white p-1">
        <span className="flex-1 px-4 text-left text-xs text-[var(--ahh-muted)]">Enter your email</span>
        <span className="rounded-full bg-[var(--ahh-lime)] px-4 py-2 text-xs font-bold text-[var(--ahh-deep-teal)]">
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
    .map((line): ArticleOutlineItem | null => {
      const match = line.match(/^##\s+(.+)$/);
      if (!match) return null;

      const title = match[1].replace(/[#*_`]/g, '').trim();
      if (!title) return null;

      return {
        id: slugifyHeading(title),
        title,
        level: 2,
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

function getMarkdownSectionTitle(section: string) {
  const match = section.match(/^##\s+(.+)$/m);
  return match ? match[1].replace(/[#*_`]/g, '').trim() : '';
}

function usesCheckListStyle(sectionTitle: string) {
  return /\b(checklist|check-list|next\s+steps?|key\s+takeaways?)\b/i.test(sectionTitle);
}

function usesKeyTakeawaysStyle(sectionTitle: string) {
  return /\bkey\s+takeaways?\b/i.test(sectionTitle);
}

type ArticleSectionKind =
  | 'default'
  | 'key-takeaways'
  | 'signs'
  | 'comparison'
  | 'steps'
  | 'checklist'
  | 'faq'
  | 'references';

function getArticleSectionKind(sectionTitle: string): ArticleSectionKind {
  if (usesKeyTakeawaysStyle(sectionTitle)) return 'key-takeaways';
  if (/\b(signs?|red\s+flags?|warning\s+signs?|what\s+to\s+look\s+for)\b/i.test(sectionTitle)) return 'signs';
  if (/\b(comparing|compare|comparison|options?|vs\.?|versus)\b/i.test(sectionTitle)) return 'comparison';
  if (/\b(step[-\s]?by[-\s]?step|steps?|next\s+steps?|guide\s+to\s+finding|how\s+to)\b/i.test(sectionTitle)) return 'steps';
  if (/\b(checklist|check-list|what\s+to\s+ask|questions?\s+to\s+ask|prepare|preparation)\b/i.test(sectionTitle)) return 'checklist';
  if (/\bfaqs?\b/i.test(sectionTitle)) return 'faq';
  if (/\breferences?\b/i.test(sectionTitle)) return 'references';
  return 'default';
}

function getArticleSectionClassName(sectionTitle: string) {
  const kind = getArticleSectionKind(sectionTitle);
  return [
    'article-section',
    `article-section--${kind}`,
    kind !== 'default' && kind !== 'faq' && kind !== 'references' ? 'article-infographic' : '',
    kind !== 'default' && kind !== 'faq' && kind !== 'references' ? `article-infographic--${kind}` : '',
  ].filter(Boolean).join(' ');
}

function createMarkdownComponents({
  checkListStyle = false,
  sectionKind = 'default',
}: {
  checkListStyle?: boolean;
  sectionKind?: ArticleSectionKind;
} = {}) {
  const isReferenceSection = sectionKind === 'references';

  return {
    h1: ({ children }: { children?: ReactNode }) => (
      <h2
        id={slugifyHeading(textFromNode(children))}
        className="article-heading article-heading--h1 scroll-mt-24"
      >
        {children}
      </h2>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
      <h2
        id={slugifyHeading(textFromNode(children))}
        className="article-heading article-heading--h2 scroll-mt-24"
      >
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
      <h3
        id={slugifyHeading(textFromNode(children))}
        className="article-heading article-heading--h3 scroll-mt-24"
      >
        {children}
      </h3>
    ),
    p: ({ children }: { children?: ReactNode }) => (
      <p className="article-paragraph">{children}</p>
    ),
    ul: ({ children, className }: { children?: ReactNode; className?: string }) => {
      const isTaskList = className?.includes('contains-task-list');
      const listClassName =
        checkListStyle || isTaskList
          ? 'article-list article-list--check article-check-list'
          : 'article-list article-list--bullet';

      return <ul className={listClassName}>{children}</ul>;
    },
    input: ({ checked, type }: { checked?: boolean; type?: string }) => (
      type === 'checkbox' ? (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-2 mt-1 h-4 w-4 shrink-0 rounded border-[var(--ahh-border)] accent-[var(--ahh-deep-teal)]"
        />
      ) : (
        <input type={type} readOnly />
      )
    ),
    ol: ({ children }: { children?: ReactNode }) => (
      <ol className={isReferenceSection ? 'article-list article-list--references' : 'article-list article-list--numbered'}>{children}</ol>
    ),
    li: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <li
        className={[
          'article-list-item',
          checkListStyle || className?.includes('task-list-item') ? 'article-list-item--check list-none' : '',
        ].join(' ')}
      >
        {children}
      </li>
    ),
    table: ({ children }: { children?: ReactNode }) => (
      <div className="article-table-wrap">
        <table className="article-table">{children}</table>
      </div>
    ),
    th: ({ children }: { children?: ReactNode }) => (
      <th className="article-table-head-cell">
        {children}
      </th>
    ),
    td: ({ children }: { children?: ReactNode }) => (
      <td className="article-table-cell">{children}</td>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className="article-quote">
        {children}
      </blockquote>
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
      <a
        href={href}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noreferrer' : undefined}
        className="font-medium text-[var(--ahh-deep-teal)] underline underline-offset-4"
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

function stripMarkdownForSummary(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+.+$/gm, ' ')
    .replace(/^\s*(?:[-*+]|\d+[.)]|\[[ xX]\])\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFallbackKeyTakeaways(content: string, excerpt?: string | null) {
  const sourceText = [excerpt || '', stripMarkdownForSummary(content)].filter(Boolean).join(' ');
  const sentences = sourceText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 8);
  const uniqueSentences: string[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const key = normalizeTitle(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueSentences.push(sentence.replace(/\s+[-–—]\s*$/, '').trim());
    if (uniqueSentences.length >= 4) break;
  }

  const fallbackItems = uniqueSentences.length >= 3
    ? uniqueSentences
    : [
        'Start with the main care decisions, language needs, costs, and follow-up questions that affect this topic.',
        'Use the guide as preparation for a conversation with a licensed clinician, clinic staff member, or insurance plan.',
        'Pay attention to cultural trust, family decision-making, and language access when planning care.',
      ];

  return `## Key Takeaways\n\n${fallbackItems.slice(0, 5).map((item) => `- [x] ${item}`).join('\n')}`;
}

function isKeyTakeawaysHeadingLine(line: string) {
  return /^##\s+Key Takeaways\b/i.test(line.trim());
}

function normalizeTakeawayText(line: string) {
  return line
    .replace(/^\s*(?:[-*+]\s*)?(?:\[[ xX]\]\s*)?/i, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim();
}

function normalizeKeyTakeawaysContent(content: string, excerpt?: string | null) {
  const rawSections = content.split(/(?=^##\s+)/m).filter((section) => section.trim());
  const bodySections: string[] = [];
  const takeawayItems: string[] = [];
  const seenTakeaways = new Set<string>();

  for (const section of rawSections) {
    const lines = section.split('\n');
    if (!isKeyTakeawaysHeadingLine(lines[0] || '')) {
      bodySections.push(section.trim());
      continue;
    }

    const carriedBodyLines: string[] = [];
    let collectingBullets = true;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (!collectingBullets) carriedBodyLines.push(line);
        continue;
      }

      const isBullet = /^[-*+]\s+(?:\[[ xX]\]\s*)?/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed);
      if (collectingBullets && isBullet) {
        const item = normalizeTakeawayText(trimmed);
        const key = normalizeTitle(item);
        if (item && !seenTakeaways.has(key)) {
          seenTakeaways.add(key);
          takeawayItems.push(item);
        }
        continue;
      }

      collectingBullets = false;
      carriedBodyLines.push(line);
    }

    const carriedBody = carriedBodyLines.join('\n').trim();
    if (carriedBody) {
      bodySections.push(carriedBody);
    }
  }

  const takeawaySection = takeawayItems.length > 0
    ? `## Key Takeaways\n\n${takeawayItems.slice(0, 5).map((item) => `- [x] ${item}`).join('\n')}`
    : buildFallbackKeyTakeaways(bodySections.join('\n\n'), excerpt);

  return [takeawaySection, ...bodySections].filter(Boolean).join('\n\n').trim();
}

function prepareArticleContent(content: string, title: string, excerpt?: string | null) {
  const normalizedTitle = normalizeTitle(title);
  const lines = dedentMarkdown(content)
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      const chatterText = trimmed.replace(/^[-*]\s+/, '').replace(/^>+\s*/, '').trim();
      const normalizedLine = normalizeTitle(trimmed.replace(/^#+\s*/, ''));

      if (!trimmed) return true;
      if (trimmed.startsWith('# ') && normalizedLine === normalizedTitle) return false;
      if (normalizedLine === `${normalizedTitle} illustration`) return false;
      if (/^["“”']*\(?\s*word\s+count\s*:\s*\d+/i.test(chatterText)) return false;
      if (/^["“”']*next\s+section\s*:/i.test(chatterText)) return false;
      if (/^here(?:'|’)?s\s+(?:the\s+)?(?:rewritten\s+)?section\s+in\s+markdown\s*:?$/i.test(chatterText)) return false;
      if (/^this\s+(?:revision|version|section|draft)\s*:?$/i.test(chatterText)) return false;
      if (/^this\s+(?:version|revision)\s+(?:maintains|keeps|uses|includes|focuses|simplifies|improves)\b/i.test(chatterText)) return false;
      if (/^let\s+me\s+know\b/i.test(chatterText)) return false;

      return true;
    });

  const prepared = lines.join('\n').trim();
  return normalizeKeyTakeawaysContent(prepared, excerpt);
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
  const imageSlots = imageSources.slice(0, 4);

  if (sections.length === 0) {
    return null;
  }

  const firstImageIndex = usesKeyTakeawaysStyle(getMarkdownSectionTitle(sections[0] || '')) ? 1 : 0;
  const imageIndexes = imageSlots.map((_, imageIndex) => {
    if (sections.length <= 1) return 0;
    const position = Math.round(((imageIndex + 1) * sections.length) / (imageSlots.length + 1)) - 1;
    return Math.min(Math.max(position, firstImageIndex), sections.length - 1);
  });

  return (
    <>
      {sections.map((section, index) => {
        const sectionTitle = getMarkdownSectionTitle(section);
        const sectionKind = getArticleSectionKind(sectionTitle);

        return (
          <div
            key={`${index}-${section.slice(0, 20)}`}
            className={[
              getArticleSectionClassName(sectionTitle),
            ].join(' ')}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={createMarkdownComponents({
                checkListStyle: usesCheckListStyle(sectionTitle),
                sectionKind,
              })}
            >
              {section}
            </ReactMarkdown>

            {imageSlots.map((imageSrc, imageIndex) =>
              index === imageIndexes[imageIndex] ? (
                <figure key={imageSrc} className="article-image-block article-image-block--inline">
                  <ArticleImage
                    src={imageSrc}
                    alt={`${title} supporting illustration ${imageIndex + 1}`}
                    className="aspect-[16/7]"
                    iconSize={92}
                  />
                </figure>
              ) : null
            )}
          </div>
        );
      })}
    </>
  );
}

export default async function ArticleDetailPage({ params, searchParams }: ArticlePageProps) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : undefined;
  const decodedSlug = decodeURIComponent(slug);
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  if (article.slug !== decodedSlug) {
    const requestedVersion = getRequestedVersion(query);
    redirect(requestedVersion ? `/insights/${article.slug}?version=${requestedVersion}` : `/insights/${article.slug}`);
  }

  const relatedArticles = await getRelatedArticles(article);
  const requestedVersion = getRequestedVersion(query);
  const { versions, selectedView, currentView } = selectArticleVersion(article, requestedVersion);
  const articleImages = getSeoImages(selectedView.seoMeta);
  const heroImageSrc = articleImages[0] || getSeoString(selectedView.seoMeta, 'og_image');
  const safeImageSrc = getSafeArticleImageSrc(heroImageSrc);
  const contentImageSources = articleImages
    .slice(1, 5)
    .map(getSafeArticleImageSrc)
    .filter((src): src is string => Boolean(src));
  const preparedContent = prepareArticleContent(selectedView.content, selectedView.title, selectedView.excerpt);
  const outline = extractOutline(preparedContent);
  const wordCount = countWords(preparedContent);
  const readMinutes = Math.max(1, Math.ceil(wordCount / 220));
  const sharePath = versionHref(article.slug, selectedView, currentView.version);
  const shareUrl = absoluteUrl(sharePath);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: selectedView.title,
    description: selectedView.excerpt || getSeoString(selectedView.seoMeta, 'description') || undefined,
    image: safeImageSrc ? [safeImageSrc] : undefined,
    author: {
      '@type': 'Organization',
      name: article.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Asian Health Hub',
    },
    datePublished: selectedView.publishedAt || article.created_at,
    dateModified: selectedView.updatedAt || article.updated_at,
  };

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="article-detail-page">
        <section className="article-page-hero">
          <div className="article-page-hero__panel">
            <div className="article-page-hero__inner brand-container">
              <nav aria-label="Breadcrumb" className="article-breadcrumbs">
                <Link href="/">Home</Link>
                <span>/</span>
                <Link href="/insights">Insights</Link>
                <span>/</span>
                <span>{selectedView.category || 'Patient Guides'}</span>
              </nav>

              <div className="article-hero-tags">
                <span>{selectedView.category || 'Patient Guide'}</span>
                <span>{selectedView.tags[0] || 'Asian Health'}</span>
                <span>{formatDate(selectedView.publishedAt)}</span>
                <span>{readMinutes} min read</span>
              </div>

              <h1 className="article-page-hero__title">
                {selectedView.title}
              </h1>

              <div className="article-author-card">
                <span className="article-author-avatar">AH</span>
                <span>
                  <strong>Asian Health Hub Editorial Team</strong>
                  <small>Patient guidance · culturally informed care</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        <VersionSwitcher
          slug={article.slug}
          versions={versions}
          selectedVersion={selectedView}
          currentVersion={currentView}
        />

        <section className="article-content-section">
          <article className="article-detail-shell brand-container grid gap-10 lg:grid-cols-[minmax(0,868px)_288px]">
            <div id="article-reading-area">
              <header className="article-detail-header">
                <ArticleImage
                  src={heroImageSrc}
                  alt={selectedView.title}
                  className="article-hero-image aspect-[16/8]"
                  iconSize={92}
                />
                <p className="article-excerpt">
                  {selectedView.excerpt || getSeoString(selectedView.seoMeta, 'description') || 'A practical guide for Asian American patients navigating care with confidence.'}
                </p>
              </header>

              <div className="mt-5">
                <ShareRow title={selectedView.title} shareUrl={shareUrl} />
              </div>

              <div id="article-content" className="article-content">
                <ArticleMarkdownWithImages
                  preparedContent={preparedContent}
                  imageSources={contentImageSources}
                  title={selectedView.title}
                />
              </div>

              <NewsletterInline />

              {selectedView.tags.length > 0 && (
                <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--ahh-border)] pt-6">
                  {selectedView.tags.map((tag) => (
                    <span key={tag} className="brand-chip">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <ArticleProgressSidebar
              outline={outline}
              readMinutes={readMinutes}
              wordCount={wordCount}
              relatedArticles={relatedArticles}
            />
          </article>
        </section>
      </main>
    </>
  );
}
