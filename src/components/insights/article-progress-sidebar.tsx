'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { Article } from '@/types/database';

export type ArticleOutlineItem = {
  id: string;
  title: string;
  level: 2 | 3;
};

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function ArticleProgressSidebar({
  outline,
  readMinutes,
  wordCount,
  relatedArticles = [],
}: {
  outline: ArticleOutlineItem[];
  readMinutes: number;
  wordCount: number;
  relatedArticles?: Article[];
}) {
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState(outline[0]?.id || '');

  useEffect(() => {
    const updateProgress = () => {
      const article = document.getElementById('article-content');
      if (!article) return;

      const rect = article.getBoundingClientRect();
      const pageTop = window.scrollY + rect.top;
      const readableHeight = Math.max(1, article.offsetHeight - window.innerHeight * 0.45);
      const readDistance = window.scrollY + window.innerHeight * 0.22 - pageTop;
      setProgress(clamp(Math.round((readDistance / readableHeight) * 100)));

      const current = outline
        .map((item) => document.getElementById(item.id))
        .filter((element): element is HTMLElement => Boolean(element))
        .filter((element) => element.getBoundingClientRect().top <= 160)
        .at(-1);

      if (current) {
        setActiveId(current.id);
      }
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);

    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, [outline]);

  return (
    <aside className="article-sidebar hidden lg:block">
      <div className="article-sidebar__inner sticky top-24 space-y-6">
        <div className="article-toc-card">
          <p className="article-toc-card__eyebrow">In this article</p>
          <p className="article-toc-card__progress">{progress}% read</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--ahh-mist)]">
            <div
              className="h-full rounded-full bg-[var(--ahh-deep-teal)] transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex gap-4 text-xs text-[var(--ahh-muted)]">
            <span>{readMinutes} min read</span>
            <span>{wordCount.toLocaleString('en-US')} words</span>
          </div>

          {outline.length > 0 && (
            <nav aria-label="Article outline" className="mt-5">
              <ol className="article-toc-list">
                {outline.map((item) => {
                  const isActive = item.id === activeId;

                  return (
                    <li key={`${item.level}-${item.id}`} className={item.level === 3 ? 'pl-3' : undefined}>
                      <a
                        href={`#${item.id}`}
                        className={[
                          'article-toc-link',
                          isActive ? 'article-toc-link--active' : '',
                        ].join(' ')}
                      >
                        {item.title}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </div>

        {relatedArticles.length > 0 && (
          <div className="article-related-card">
            <p className="article-toc-card__eyebrow">Related Articles</p>
            <div className="mt-4 grid gap-4">
              {relatedArticles.slice(0, 3).map((article) => (
                <Link key={article.id} href={`/insights/${article.slug}`} className="article-related-link">
                  <span className="article-related-category">
                    {article.category || article.tags[0] || 'Insight'}
                  </span>
                  <span className="article-related-title">{article.title}</span>
                  <span className="article-related-date">
                    {article.published_at
                      ? new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                      : 'Recently'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="article-sidebar-cta">
          <span className="article-sidebar-cta__icon" aria-hidden="true">
            <Search className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <h2>Find a Clinic Today</h2>
          <p>Search Asian Health Hub for care teams who speak your language.</p>
          <Link href="/search" className="article-sidebar-cta__button">
            Search Clinics →
          </Link>
        </div>
      </div>
    </aside>
  );
}
