'use client';

// A pill search bar that floats at the bottom of the screen once the visitor has
// scrolled past the hero, and steps aside again when the footer comes into view.
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/lib/i18n/context';

export function FloatingSearch({ action = '/search' }: { action?: string }) {
  const { t } = useLocale();
  const [shown, setShown] = useState(false);
  const form = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    let pastHero = false;
    let atFooter = false;
    const sync = () => {
      const show = pastHero && !atFooter;
      setShown(show);
      // never leave keyboard focus inside a bar that just slid away
      if (!show && form.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = window.scrollY > window.innerHeight * 0.7;
        if (next !== pastHero) {
          pastHero = next;
          sync();
        }
      });
    };
    const foot = document.querySelector('.site-foot');
    const io = new IntersectionObserver(([e]) => {
      atFooter = e.isIntersecting;
      sync();
    });
    if (foot) io.observe(foot);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <form
      ref={form}
      action={action}
      method="get"
      role="search"
      aria-label="Quick clinic search"
      aria-hidden={!shown}
      inert={!shown}
      className="site-fsearch"
      data-shown={shown}
    >
      <div className="site-fsearch-pill">
        <svg className="site-fsearch-icon" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <label htmlFor={'site-fsearch-q'} className="sr-only">{t.footer.floatingPlaceholder}</label>
        <input
          id={'site-fsearch-q'}
          name="query"
          type="search"
          placeholder={t.footer.floatingPlaceholder}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit">
          {t.footer.searchBtn}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}
