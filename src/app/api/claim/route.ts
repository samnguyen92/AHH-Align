import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getBearerToken,
  getUserFromAccessToken,
} from '@/services/auth-service';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';

export const dynamic = 'force-dynamic';

const VALID_PROOF_TYPES = new Set([
  'npi_verification',
  'phone_verification',
  'document',
]);

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = getBearerToken(request) ?? cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const user = await getUserFromAccessToken(token);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: {
    clinic_id?: string;
    proof_type?: string;
    proof_data?: Record<string, unknown>;
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.clinic_id) {
    return NextResponse.json({ error: 'clinic_id is required.' }, { status: 400 });
  }

  const proofType = body.proof_type ?? 'npi_verification';
  if (!VALID_PROOF_TYPES.has(proofType)) {
    return NextResponse.json({ error: 'Invalid proof_type.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: clinic } = await supabase
    .from('clinics')
    .select('id,is_claimed')
    .eq('id', body.clinic_id)
    .maybeSingle();

  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not found.' }, { status: 404 });
  }

  if (clinic.is_claimed) {
    return NextResponse.json(
      { error: 'This clinic profile has already been claimed.' },
      { status: 409 }
    );
  }

  const { data: existing } = await supabase
    .from('claim_requests')
    .select('id,status,created_at')
    .eq('clinic_id', body.clinic_id)
    .eq('user_id', user.id)
    .in('status', ['pending', 'approved'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'A claim request already exists for this clinic.', claim_request: existing },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('claim_requests')
    .insert({
      clinic_id: body.clinic_id,
      user_id: user.id,
      proof_type: proofType,
      proof_data: body.proof_data ?? {},
      notes: body.notes ?? null,
      status: 'pending',
    })
    .select('id,clinic_id,status,created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ claim_request: data }, { status: 201 });
}
