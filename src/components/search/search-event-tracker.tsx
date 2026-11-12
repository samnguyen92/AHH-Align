'use client';

import { useEffect, useRef } from 'react';
import { trackEvent } from '@/lib/analytics';

interface SearchEventTrackerProps {
  query?: string;
  resultCount: number;
  filters?: Record<string, string | undefined>;
}

/**
 * Emits one `search_query` event per distinct search, including result_count so the
 * stats agent can report zero-result searches (demand the directory cannot serve yet).
 */
export function SearchEventTracker({ query, resultCount, filters }: SearchEventTrackerProps) {
  const lastKey = useRef<string>('');
  const cleanQuery = (query ?? '').trim();
  const activeFilters = Object.fromEntries(
    Object.entries(filters ?? {}).filter(([, v]) => Boolean(v))
  );
  const key = `${cleanQuery}|${resultCount}|${JSON.stringify(activeFilters)}`;

  useEffect(() => {
    if (!cleanQuery || lastKey.current === key) return;
    lastKey.current = key;
    trackEvent('search_query', {
      query: cleanQuery.slice(0, 120),
      result_count: resultCount,
      zero_result: resultCount === 0,
      filters: activeFilters,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

