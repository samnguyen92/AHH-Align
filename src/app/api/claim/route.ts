import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/services/supabase-server';
import {
  getBearerToken,
  getUserFromAccessToken,
} from '@/services/auth-service';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const VALID_PROOF_TYPES = new Set([
  'npi_verification',
  'phone_verification',
  'document',
]);

// ─────────────────────────────────────────────
// POST /api/claim
//
// Handles two distinct flows:
//   1. Submit a NEW clinic profile (no clinic_id) — saves to clinic_submissions, no auth required
//   2. Claim an EXISTING profile (has clinic_id) — saves to claim_requests, auth required
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  let body: {
    // Flow 1 — new clinic profile submission (no auth required)
    clinic_name?: string;
    full_name?: string;
    role?: string;
    email?: string;
    phone?: string;
    website?: string;
    updates?: string;
    // Flow 2 — claim existing profile (auth required)
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

  const supabase = createServerSupabaseClient();

  // ── Flow 1: New Clinic Profile Submission ──
  if (!body.clinic_id) {
    const { clinic_name, full_name, role, email, phone } = body;

    if (!clinic_name || !full_name || !role || !email || !phone) {
      return NextResponse.json(
        { error: 'clinic_name, full_name, role, email, and phone are required.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('clinic_submissions')
      .insert({
        clinic_name: clinic_name.trim(),
        full_name: full_name.trim(),
        role: role.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        website: body.website?.trim() ?? null,
        updates: body.updates?.trim() ?? null,
        status: 'pending',
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('[Claim API] clinic_submissions insert error:', error.message);
      return NextResponse.json({ error: 'Failed to submit. Please try again.' }, { status: 500 });
    }

    // Telegram notification
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    await sendTelegramMessage(
      `🏥 <b>New Clinic Profile Submission</b>\n\n` +
      `• <b>Clinic Name:</b> ${clinic_name}\n` +
      `• <b>Submitted By:</b> ${full_name} (${role})\n` +
      `• <b>Email:</b> ${email}\n` +
      `• <b>Phone:</b> ${phone}\n` +
      (body.website ? `• <b>Website:</b> ${body.website}\n` : '') +
      (body.updates ? `• <b>Requested Updates:</b> ${body.updates}\n` : '') +
      `• <b>Time (PT):</b> ${now}\n` +
      `• <b>Submission ID:</b> <code>${data.id}</code>\n\n` +
      `<i>Use /check_claims to review pending submissions.</i>`
    );

    return NextResponse.json({ submission: data }, { status: 201 });
  }

  // ── Flow 2: Claim Existing Clinic Profile (no auth required) ──
  const cookieStore = await cookies();
  const token = getBearerToken(request) ?? cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const user = token ? await getUserFromAccessToken(token) : null;

  const proofData = body.proof_data ?? {};
  if (!user) {
    const { full_name, email, phone, role } = proofData;
    if (!full_name || !email || !phone || !role) {
      return NextResponse.json(
        { error: 'Contact information (full_name, email, phone, role) is required for guest claims.' },
        { status: 400 }
      );
    }
  }

  const proofType = body.proof_type ?? 'npi_verification';
  if (!VALID_PROOF_TYPES.has(proofType)) {
    return NextResponse.json({ error: 'Invalid proof_type.' }, { status: 400 });
  }

  const { data: clinic } = await supabase
    .from('clinics')
    .select('id, name, is_claimed')
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

  const query = supabase
    .from('claim_requests')
    .select('id, status, created_at')
    .eq('clinic_id', body.clinic_id)
    .in('status', ['pending', 'approved']);

  if (user) {
    query.eq('user_id', user.id);
  } else {
    query.eq('proof_data->>email', proofData.email?.toLowerCase().trim());
  }

  const { data: existing } = await query.maybeSingle();

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
      user_id: user?.id ?? null,
      proof_type: proofType,
      proof_data: proofData,
      notes: body.notes ?? null,
      status: 'pending',
    })
    .select('id, clinic_id, status, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Telegram notification
  const claimantName = user ? (user.user_metadata?.full_name || 'Authenticated User') : proofData.full_name;
  const claimantEmail = user ? user.email : proofData.email;
  const claimantPhone = user ? (user.phone || 'N/A') : proofData.phone;
  const claimantRole = user ? 'Authenticated Owner' : proofData.role;

  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  await sendTelegramMessage(
    `🔐 <b>New Clinic Claim Request</b>\n\n` +
    `• <b>Clinic:</b> ${clinic.name}\n` +
    `• <b>Clinic ID:</b> <code>${body.clinic_id}</code>\n` +
    `• <b>Claimant:</b> ${claimantName} (${claimantRole})\n` +
    `• <b>Email:</b> ${claimantEmail}\n` +
    `• <b>Phone:</b> ${claimantPhone}\n` +
    `• <b>Proof Type:</b> ${proofType}\n` +
    (body.notes ? `• <b>Notes:</b> ${body.notes}\n` : '') +
    `• <b>Time (PT):</b> ${now}\n` +
    `• <b>Request ID:</b> <code>${data.id}</code>\n\n` +
    `<i>Use /check_claims to review pending claim requests.</i>`
  );

  return NextResponse.json({ claim_request: data }, { status: 201 });
}
