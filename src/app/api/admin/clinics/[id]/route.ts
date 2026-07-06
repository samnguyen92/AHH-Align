import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';
import { getBearerToken, getUserFromAccessToken, isAdminUser } from '@/services/auth-service';
import { getAdminClinicById } from '@/services/admin-service';
import { createServerSupabaseClient } from '@/services/supabase-server';

interface RouteProps {
  params: Promise<{ id: string }>;
}

async function getAuthUser(request: Request) {
  const cookieStore = await cookies();
  const token = getBearerToken(request) ?? cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await getUserFromAccessToken(token);
  if (!(await isAdminUser(user))) return null;
  return user;
}

export async function GET(request: Request, { params }: RouteProps) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const clinic = await getAdminClinicById(id);

  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
  }

  return NextResponse.json({ clinic });
}

export async function PATCH(request: Request, { params }: RouteProps) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const {
    name,
    address,
    city,
    state,
    zip_code,
    phone,
    languages,
    specialty,
    description,
    metadata,
  } = body;

  if (!name) {
    return NextResponse.json({ error: 'Facility name is required.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: current, error: getError } = await supabase
    .from('clinics')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (getError || !current) {
    return NextResponse.json({ error: 'Clinic not found.' }, { status: 404 });
  }

  const currentMetadata = current.metadata ?? {};
  const mergedMetadata = {
    ...currentMetadata,
    ...(metadata ?? {}),
  };

  const { data: updated, error: updateError } = await supabase
    .from('clinics')
    .update({
      name,
      address: address ?? null,
      city: city ?? null,
      state: state ?? null,
      zip_code: zip_code ?? null,
      phone: phone ?? null,
      languages: Array.isArray(languages) ? languages : current.languages,
      specialty: specialty ?? null,
      description: description ?? null,
      metadata: mergedMetadata,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  revalidatePath('/admin/clinics');
  revalidatePath(`/clinics/${id}`);
  revalidatePath('/search');

  return NextResponse.json({ ok: true, clinic: updated });
}
