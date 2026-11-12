export type AnalyticsEventName =
  | 'page_view'
  | 'search_query'
  | 'clinic_click'
  | 'claim_start';

const SESSION_KEY = 'ahh_sid';
const UTM_KEY = 'ahh_utm';
const RETURNING_KEY = 'ahh_returning';

/** Random anonymous session id. Lives in sessionStorage only; no PII, no cross-session identity. */
function getSessionId(): string {
  try {
    let sid = window.sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 'no-storage';
  }
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1100) return 'tablet';
  return 'desktop';
}

function getUtm(): Record<string, string> {
  try {
    const params = new URLSearchParams(window.location.search);
    const fresh: Record<string, string> = {};
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
      const val = params.get(key);
      if (val) fresh[key] = val.slice(0, 80);
    }
    if (Object.keys(fresh).length > 0) {
      window.sessionStorage.setItem(UTM_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const stored = window.sessionStorage.getItem(UTM_KEY);
    return stored ? (JSON.parse(stored) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Referrer hostname only (never the full URL), external referrers only. */
function getReferrerHost(): string | null {
  try {
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname;
    return host && host !== window.location.hostname ? host : null;
  } catch {
    return null;
  }
}

function isReturningVisitor(): boolean {
  try {
    const seen = window.localStorage.getItem(RETURNING_KEY) === '1';
    if (!seen) window.localStorage.setItem(RETURNING_KEY, '1');
    return seen;
  } catch {
    return false;
  }
}

function buildContext(): Record<string, unknown> {
  const utm = getUtm();
  return {
    session_id: getSessionId(),
    device: getDeviceType(),
    referrer: getReferrerHost(),
    returning: isReturningVisitor(),
    lang: navigator.language?.slice(0, 5) ?? null,
    ...utm,
  };
}

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
    metadata: { ...buildContext(), ...metadata },
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
