import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireSuperAdminFromRequest } from '@/services/auth-service';
import { getPool } from '@/lib/db/postgres';
import type { AdminUserRole } from '@/services/admin-service';

export const dynamic = 'force-dynamic';

const allowedRoles = new Set<AdminUserRole>(['user', 'provider', 'admin', 'superadmin']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RoleRouteProps {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/users/[id]/role  { "role": "user" | "provider" | "admin" | "superadmin" }
 *
 * Same rules as the Telegram bot (openclaw/user_admin.py), which uses the SAME advisory lock, so a change made
 * from the web and one made from the bot cannot race each other into removing the last superadmin:
 *   - you cannot change your own role;
 *   - a disabled account must be restored first;
 *   - the last active superadmin cannot be demoted;
 *   - every change is written to audit_log.
 */
export async function PATCH(request: Request, { params }: RoleRouteProps) {
  const actor = await requireSuperAdminFromRequest(request);
  if (!actor) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const role = body.role as AdminUserRole | undefined;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
  }
  if (!role || !allowedRoles.has(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }
  if (id === actor.id) {
    return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ahh_superadmin_guard'))");

    const found = await client.query(
      `SELECT u.email, u.disabled_at, COALESCE(r.role, 'provider') AS role
       FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id
       WHERE u.id = $1 FOR UPDATE OF u`,
      [id]
    );
    const target = found.rows[0];
    if (!target) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (target.disabled_at) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'This account is disabled. Restore it first.' }, { status: 409 });
    }
    if (target.role === role) {
      await client.query('ROLLBACK');
      return NextResponse.json({ ok: true, role, unchanged: true });
    }
    if (target.role === 'superadmin' && role !== 'superadmin') {
      const active = await client.query(
        `SELECT u.id FROM auth.users u JOIN public.user_roles r ON r.user_id = u.id
         WHERE r.role = 'superadmin' AND u.disabled_at IS NULL FOR UPDATE OF u`
      );
      if (active.rows.length <= 1) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'This is the last active superadmin and cannot be demoted. Promote another user first.' },
          { status: 409 }
        );
      }
    }

    await client.query(
      `INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`,
      [id, role]
    );
    await client.query(
      `INSERT INTO public.audit_log (actor, action, target_type, target_id, target_label, details)
       VALUES ($1, 'user.role_changed', 'user', $2, $3, $4)`,
      [`user:${actor.id}`, id, target.email, JSON.stringify({ from: target.role, to: role })]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[admin/users/role] failed:', err);
    return NextResponse.json({ error: 'Could not update the role.' }, { status: 500 });
  } finally {
    client.release();
  }

  revalidatePath('/admin/users');
  return NextResponse.json({ ok: true, role });
}
