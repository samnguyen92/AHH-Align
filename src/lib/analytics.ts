export type AnalyticsEventName =
  | 'page_view'
  | 'search_query'
  | 'clinic_click'
  | 'claim_start';

export function trackEvent(
  eventName: AnalyticsEventName,
  metadata: Record<string, unknown> = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  // Forward to Google Analytics 4 (GA4) if available
  if ((window as any).gtag) {
    try {
      (window as any).gtag('event', eventName, {
        page_path: window.location.pathname,
        ...metadata,
      });
    } catch (e) {
      console.warn('[analytics] GA4 event forwarding failed:', e);
    }
  }

  const payload = JSON.stringify({
    event_name: eventName,
    path: window.location.pathname,
    metadata,
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics', new Blob([payload], { type: 'application/json' }));
    return;
  }

  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Analytics should never interrupt the user flow.
  });
}
