import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/services/supabase-server';

export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set([
  'page_view',
  'search_query',
  'clinic_click',
  'claim_start',
]);

/** Crawlers, uptime monitors and headless tools should not inflate human traffic numbers. */
const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|pingdom|uptime|monitor|headless|lighthouse|python-requests|curl|wget|playwright|puppeteer/i;

const MAX_METADATA_BYTES = 2048;

export async function POST(request: NextRequest) {
  let body: {
    event_name?: string;
    path?: string;
    metadata?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.event_name || !ALLOWED_EVENTS.has(body.event_name)) {
    return NextResponse.json({ error: 'Invalid event_name.' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent') ?? '';
  if (!userAgent || BOT_UA.test(userAgent)) {
    // Acknowledge but do not store: keeps human metrics clean without telling bots apart.
    return NextResponse.json({ ok: true, skipped: 'bot' });
  }

  // Coarse location only (country/city from the edge); the raw IP is never stored.
  const geoCountry =
    request.headers.get('x-vercel-ip-country') || request.headers.get('cf-ipcountry') || null;
  let geoCity = request.headers.get('x-vercel-ip-city') || request.headers.get('cf-ipcity') || null;
  if (geoCity) {
    try {
      geoCity = decodeURIComponent(geoCity);
    } catch {
      // keep raw value
    }
  }

  let metadata: Record<string, unknown> = {
    ...(body.metadata ?? {}),
    ...(geoCountry ? { geo_country: geoCountry } : {}),
    ...(geoCity ? { geo_city: geoCity } : {}),
  };
  if (JSON.stringify(metadata).length > MAX_METADATA_BYTES) {
    metadata = { truncated: true, session_id: metadata.session_id ?? null };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('analytics_events').insert({
      event_name: body.event_name,
      path: typeof body.path === 'string' ? body.path.slice(0, 300) : null,
      metadata,
    });

    if (error) {
      throw error;
    }
  } catch (err) {
    console.error('[analytics] insert error:', err);
  }

  return NextResponse.json({ ok: true });
}
