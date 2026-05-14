import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireSuperAdminFromRequest } from '@/services/auth-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { AdminUserRole } from '@/services/admin-service';

const allowedRoles = new Set<AdminUserRole>(['user', 'provider', 'admin', 'superadmin']);

interface RoleRouteProps {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RoleRouteProps) {
  const user = await requireSuperAdminFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const role = body.role as AdminUserRole | undefined;

  if (!role || !allowedRoles.has(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from('user_roles')
    .upsert({ user_id: id, role }, { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/admin/users');
  return NextResponse.json({ ok: true, role });
}
