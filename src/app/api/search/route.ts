import { NextRequest, NextResponse } from 'next/server';
import { searchClinics } from '@/services/clinic-service';

/**
 * GET /api/search — Public REST endpoint cho clinic search.
 * Dùng bởi Client Components khi cần fetch mà không reload page.
 *
 * Query params: city, state, specialty, language, query, page, limit
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const result = await searchClinics({
      city: searchParams.get('city') ?? undefined,
      state: searchParams.get('state') ?? undefined,
      specialty: searchParams.get('specialty') ?? undefined,
      language: searchParams.get('language') ?? undefined,
      query: searchParams.get('query') ?? undefined,
      page: Number(searchParams.get('page')) || 1,
      limit: Math.min(Number(searchParams.get('limit')) || 20, 100),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('[api/search] error:', err);
    return NextResponse.json(
      { error: 'Failed to search clinics' },
      { status: 500 }
    );
  }
}
