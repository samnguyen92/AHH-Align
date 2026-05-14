import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

interface AdminClaimRouteProps {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: AdminClaimRouteProps) {
  const user = await requireAdminFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as { status?: string };

  if (body.status !== 'approved' && body.status !== 'rejected') {
    return NextResponse.json({ error: 'status must be approved or rejected.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: claim, error: claimError } = await supabase
    .from('claim_requests')
    .select('id,clinic_id,user_id,status')
    .eq('id', id)
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (!claim) {
    return NextResponse.json({ error: 'Claim request not found.' }, { status: 404 });
  }

  const { data: updatedClaim, error: updateError } = await supabase
    .from('claim_requests')
    .update({
      status: body.status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id,status,clinic_id,user_id')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (body.status === 'approved') {
    const { error: clinicError } = await supabase
      .from('clinics')
      .update({
        claimed_by: claim.user_id,
        is_claimed: true,
      })
      .eq('id', claim.clinic_id);

    if (clinicError) {
      return NextResponse.json({ error: clinicError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ claim_request: updatedClaim });
}
