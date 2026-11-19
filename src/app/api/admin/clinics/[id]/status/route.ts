import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';
import { getBearerToken, getUserFromAccessToken, isAdminUser } from '@/services/auth-service';
import { createServerSupabaseClient } from '@/services/supabase-server';

export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = new Set(['draft', 'published', 'archived']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteProps {
  params: Promise<{ id: string }>;
}

async function getAdmin(request: Request) {
  const cookieStore = await cookies();
  const token = getBearerToken(request) ?? cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await getUserFromAccessToken(token);
  return (await isAdminUser(user)) ? user : null;
}

/**
 * PATCH /api/admin/clinics/[id]/status  { "status": "draft" | "published" | "archived" }
 *
 * Publishes a draft clinic (new clinics from the OpenClaw scout start as drafts), or hides one again.
 */
export async function PATCH(request: Request, { params }: RouteProps) {
  const admin = await getAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid clinic id.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: 'status must be draft, published or archived.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('clinics')
    .update({ status })
    .eq('id', id)
    .select('id,slug,status')
    .maybeSingle();

  if (error) {
    console.error('[admin/clinics/status] update failed:', error);
    return NextResponse.json({ error: 'Could not update the clinic status.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Clinic not found.' }, { status: 404 });
  }

  revalidatePath('/');
  revalidatePath('/search');
  revalidatePath('/sitemap.xml');
  revalidatePath('/admin/clinics');
  if (data.slug) {
    revalidatePath(`/clinics/${data.slug}`);
  }

  return NextResponse.json({ ok: true, clinic: data });
}
