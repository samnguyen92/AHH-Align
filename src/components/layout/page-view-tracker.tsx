'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';

const CLINIC_PATH = /^\/clinics\/([^/?#]+)/;

function cleanText(value: string | null | undefined, max = 80): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function slugToName(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function classifyExternalAction(anchor: HTMLAnchorElement): string {
  const href = anchor.href.toLowerCase();
  const label = `${anchor.innerText} ${anchor.getAttribute('aria-label') ?? ''}`.toLowerCase();
  if (href.includes('google.com/maps') || href.includes('maps.app.goo.gl') || label.includes('direction')) {
    return 'directions';
  }
  if (label.includes('book') || label.includes('appointment') || label.includes('schedule')) {
    return 'booking';
  }
  return 'website';
}

/**
 * Page views + delegated click tracking.
 * - page_view on every route change
 * - clinic_click for: call, email, website, directions, booking, and clinic card opens
 * - claim_start when a visitor clicks through to /claim
 * One listener covers every component, so new UI cannot silently lose tracking.
 */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackEvent('page_view', {
      search: window.location.search.replace(/^\?/, ''),
    });
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;

      const currentPath = window.location.pathname;
      const currentClinic = currentPath.match(CLINIC_PATH)?.[1];

      if (anchor.href.startsWith('tel:') || anchor.href.startsWith('mailto:')) {
        const action = anchor.href.startsWith('tel:') ? 'call' : 'email';
        const slug = currentClinic ?? null;
        trackEvent('clinic_click', {
          action,
          clinic_slug: slug,
          clinic_id: slug,
          clinic_name: slug ? cleanText(document.querySelector('h1')?.textContent) || slugToName(slug) : null,
        });
        return;
      }

      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }

      const isInternal = url.hostname === window.location.hostname;

      if (isInternal && url.pathname.startsWith('/claim')) {
        trackEvent('claim_start', { from: currentPath, clinic_slug: currentClinic ?? null });
        return;
      }

      if (!isInternal && currentClinic) {
        trackEvent('clinic_click', {
          action: classifyExternalAction(anchor),
          clinic_slug: currentClinic,
          clinic_id: currentClinic,
          clinic_name: cleanText(document.querySelector('h1')?.textContent) || slugToName(currentClinic),
          target_host: url.hostname,
        });
        return;
      }

      const openedClinic = isInternal ? url.pathname.match(CLINIC_PATH)?.[1] : undefined;
      if (openedClinic && openedClinic !== currentClinic) {
        trackEvent('clinic_click', {
          action: 'card',
          clinic_slug: openedClinic,
          clinic_id: openedClinic,
          clinic_name: anchor.getAttribute('data-clinic-name') || slugToName(openedClinic),
          from: currentPath,
        });
      }
    };

    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
