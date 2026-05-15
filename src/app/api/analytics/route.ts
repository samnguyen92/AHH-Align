import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/services/supabase-server';

export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set([
  'page_view',
  'search_query',
  'clinic_click',
  'claim_start',
]);

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

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('analytics_events').insert({
      event_name: body.event_name,
      path: body.path ?? null,
      metadata: body.metadata ?? {},
    });

    if (error) {
      throw error;
    }
  } catch (err) {
    console.error('[analytics] insert error:', err);
  }

  return NextResponse.json({ ok: true });
}
