'use client';

import { useEffect, useState } from 'react';

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
}: {
  outline: ArticleOutlineItem[];
  readMinutes: number;
  wordCount: number;
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
    <aside className="hidden lg:block">
      <div className="sticky top-24 space-y-8 border-b border-[var(--ahh-border)] pb-8">
        <div>
          <p className="brand-caption font-semibold uppercase text-[var(--ahh-ink)]">On This Page</p>
          <p className="mt-2 text-2xl font-medium text-[var(--ahh-muted)]">{progress}% read</p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-[var(--ahh-mist)]">
            <div
              className="h-full rounded-full bg-[var(--ahh-deep-teal)] transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-4 flex gap-4 text-xs text-[var(--ahh-muted)]">
            <span>{readMinutes} min read</span>
            <span>{wordCount.toLocaleString('en-US')} words</span>
          </div>
        </div>

        {outline.length > 0 && (
          <nav aria-label="Article outline">
            <ol className="space-y-3">
              {outline.map((item) => {
                const isActive = item.id === activeId;

                return (
                  <li key={`${item.level}-${item.id}`} className={item.level === 3 ? 'pl-4' : undefined}>
                    <a
                      href={`#${item.id}`}
                      className={[
                        'block text-sm leading-6 transition-colors',
                        isActive ? 'text-[var(--ahh-deep-teal)]' : 'text-[var(--ahh-muted)] hover:text-[var(--ahh-ink)]',
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
    </aside>
  );
}
