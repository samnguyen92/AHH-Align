import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';
import { getBearerToken, getUserFromAccessToken, isAdminUser } from '@/services/auth-service';
import { createServerSupabaseClient } from '@/services/supabase-server';

async function getAuthUser(request: Request) {
  const cookieStore = await cookies();
  const token = getBearerToken(request) ?? cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await getUserFromAccessToken(token);
  if (!(await isAdminUser(user))) return null;
  return user;
}

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '7d';

  let daysLimit = 7;
  if (range === '30d') {
    daysLimit = 30;
  } else if (range === '1y') {
    daysLimit = 365;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysLimit);

  // Fetch events based on range selection
  const { data: events, error } = await supabase
    .from('analytics_events')
    .select('*')
    .gte('created_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(4000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 1. Metric Counts
  const counts = {
    page_view: 0,
    search_query: 0,
    clinic_click: 0,
    claim_start: 0,
  };

  events.forEach((e) => {
    const name = e.event_name as keyof typeof counts;
    if (counts[name] !== undefined) {
      counts[name]++;
    }
  });

  // 2. Popular Searches
  const searchesMap: Record<string, number> = {};
  events.forEach((e) => {
    if (e.event_name === 'search_query' && e.metadata?.query) {
      const q = String(e.metadata.query).trim().toLowerCase();
      if (q) {
        searchesMap[q] = (searchesMap[q] || 0) + 1;
      }
    }
  });
  const popularSearches = Object.entries(searchesMap)
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 3. Clicked Clinics
  const clinicsMap: Record<string, { name: string; count: number }> = {};
  events.forEach((e) => {
    if (e.event_name === 'clinic_click' && e.metadata?.clinic_id) {
      const id = String(e.metadata.clinic_id);
      const name = String(e.metadata.clinic_name || 'Unknown Clinic');
      if (!clinicsMap[id]) {
        clinicsMap[id] = { name, count: 0 };
      }
      clinicsMap[id].count++;
    }
  });
  const popularClinics = Object.entries(clinicsMap)
    .map(([id, { name, count }]) => ({ id, name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 4. Page Views by Path
  const pathsMap: Record<string, number> = {};
  events.forEach((e) => {
    if (e.event_name === 'page_view' && e.path) {
      pathsMap[e.path] = (pathsMap[e.path] || 0) + 1;
    }
  });
  const popularPaths = Object.entries(pathsMap)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 5. Daily or Monthly Trend
  const trendViews: Record<string, number> = {};

  if (range === '1y') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      trendViews[dateStr] = 0;
    }

    events.forEach((e) => {
      if (e.event_name === 'page_view') {
        const dateStr = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (trendViews[dateStr] !== undefined) {
          trendViews[dateStr]++;
        }
      }
    });
  } else {
    const days = range === '30d' ? 30 : 7;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      trendViews[dateStr] = 0;
    }

    events.forEach((e) => {
      if (e.event_name === 'page_view') {
        const dateStr = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (trendViews[dateStr] !== undefined) {
          trendViews[dateStr]++;
        }
      }
    });
  }

  const dailyTrend = Object.entries(trendViews).map(([date, count]) => ({ date, count }));

  // 6. Recent events stream
  const recentEvents = events.slice(0, 30);

  return NextResponse.json({
    counts,
    popularSearches,
    popularClinics,
    popularPaths,
    dailyTrend,
    recentEvents,
  });
}
