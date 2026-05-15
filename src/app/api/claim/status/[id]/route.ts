import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/services/supabase-server';
import {
  getBearerToken,
  getUserFromAccessToken,
} from '@/services/auth-service';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';

export const dynamic = 'force-dynamic';

interface ClaimStatusRouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: ClaimStatusRouteProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = getBearerToken(request) ?? cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const user = await getUserFromAccessToken(token);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('claim_requests')
    .select('id,clinic_id,status,proof_type,notes,reviewed_at,created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Claim request not found.' }, { status: 404 });
  }

  return NextResponse.json({ claim_request: data });
}
