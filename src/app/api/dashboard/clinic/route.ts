import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getBearerToken, getUserFromAccessToken } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const user = await getUserFromAccessToken(getBearerToken(request));

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const body = await request.json();
  const clinicId = typeof body.clinic_id === 'string' ? body.clinic_id : null;

  if (!clinicId) {
    return NextResponse.json({ error: 'clinic_id is required.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: clinic } = await supabase
    .from('clinics')
    .select('id,claimed_by,metadata')
    .eq('id', clinicId)
    .maybeSingle();

  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not found.' }, { status: 404 });
  }

  const { data: approvedClaim } = await supabase
    .from('claim_requests')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .maybeSingle();

  if (clinic.claimed_by !== user.id && !approvedClaim) {
    return NextResponse.json({ error: 'This profile is not approved for your account.' }, { status: 403 });
  }

  const currentMetadata =
    clinic.metadata && typeof clinic.metadata === 'object' ? clinic.metadata : {};
  const nextMetadata =
    body.metadata && typeof body.metadata === 'object'
      ? { ...currentMetadata, ...body.metadata }
      : currentMetadata;

  const update = {
    name: body.name,
    description: body.description,
    address: body.address,
    city: body.city,
    state: typeof body.state === 'string' ? body.state.toUpperCase() : body.state,
    zip_code: body.zip_code,
    phone: body.phone,
    specialty: body.specialty,
    languages: Array.isArray(body.languages) ? body.languages : [],
    is_telehealth_available: Boolean(body.is_telehealth_available),
    metadata: nextMetadata,
    claimed_by: clinic.claimed_by ?? user.id,
    is_claimed: true,
  };

  const { data, error } = await supabase
    .from('clinics')
    .update(update)
    .eq('id', clinicId)
    .select('id,slug')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ clinic: data });
}
