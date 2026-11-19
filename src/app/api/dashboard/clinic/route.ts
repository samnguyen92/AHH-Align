import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/services/supabase-server';
import { getBearerToken, getUserFromAccessToken } from '@/services/auth-service';
import { normalizeLanguageList } from '@/lib/languages';

export const dynamic = 'force-dynamic';

// Metadata keys owned by the platform (ratings, reviews, verification, scoring, Google data).
// A clinic owner must not be able to set these through the dashboard.
const SYSTEM_METADATA_KEYS = new Set([
  'rating',
  'rating_count',
  'review_profile',
  'review_summary',
  'reviews',
  'quality_score',
  'quality_missing',
  'languages_verified',
  'languages_evidence',
  'languages_source',
  'third_party_profiles',
  'external_sources',
  'google_photo_attributions',
]);

function stripSystemMetadata(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => !SYSTEM_METADATA_KEYS.has(key) && !key.startsWith('google_')
    )
  );
}

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
  const baseMetadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? { ...currentMetadata, ...stripSystemMetadata(body.metadata as Record<string, unknown>) }
      : currentMetadata;
  // languages typed by the owner are authoritative: scrapers must not overwrite them with a weaker guess
  const nextMetadata = Array.isArray(body.languages) ? { ...baseMetadata, languages_source: 'manual' } : baseMetadata;

  const update = {
    name: body.name,
    description: body.description,
    address: body.address,
    city: body.city,
    state: typeof body.state === 'string' ? body.state.toUpperCase() : body.state,
    zip_code: body.zip_code,
    phone: body.phone,
    specialty: body.specialty,
    languages: Array.isArray(body.languages) ? normalizeLanguageList(body.languages, { keepUnknown: true }) : [],
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
