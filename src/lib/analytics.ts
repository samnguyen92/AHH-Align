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
