import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPool } from '@/lib/db/postgres';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';
import { verifySessionToken } from '@/lib/auth/token';

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  role: AppRole | null;
}

export type AppRole = 'user' | 'provider' | 'admin' | 'superadmin';

const APP_ROLES = new Set<AppRole>(['user', 'provider', 'admin', 'superadmin']);

function normalizeRole(role: unknown): AppRole | null {
  return typeof role === 'string' && APP_ROLES.has(role as AppRole)
    ? (role as AppRole)
    : null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return getUserFromAccessToken(token);
}

export async function getCurrentUserWithRole(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const dbRole = await getUserRole(user.id);
  return {
    ...user,
    role: dbRole ?? user.role ?? 'provider',
  };
}

export async function getUserRole(userId: string): Promise<AppRole | null> {
  try {
    const pool = getPool();
    const res = await pool.query('SELECT role FROM public.user_roles WHERE user_id = $1', [userId]);
    return normalizeRole(res.rows[0]?.role);
  } catch (err) {
    console.error('[auth-service] getUserRole failed:', err);
    return null;
  }
}

export async function isAdminUser(user: CurrentUser | null): Promise<boolean> {
  if (!user) {
    return false;
  }

  if (user.role === 'admin' || user.role === 'superadmin') {
    return true;
  }

  const dbRole = await getUserRole(user.id);
  return dbRole === 'admin' || dbRole === 'superadmin';
}

export async function isSuperAdminUser(user: CurrentUser | null): Promise<boolean> {
  if (!user) {
    return false;
  }

  if (user.role === 'superadmin') {
    return true;
  }

  const dbRole = await getUserRole(user.id);
  return dbRole === 'superadmin';
}

export async function requireAdminUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/auth/login?next=/admin');
  }

  if (!(await isAdminUser(user))) {
    redirect('/dashboard');
  }

  return {
    ...user,
    role: (await getUserRole(user.id)) ?? user.role,
  };
}

export async function requireSuperAdminUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/auth/login?next=/admin/users');
  }

  if (!(await isSuperAdminUser(user))) {
    redirect('/admin');
  }

  return {
    ...user,
    role: 'superadmin',
  };
}

export async function requireAdminFromRequest(request: Request): Promise<CurrentUser | null> {
  const user = await getUserFromAccessToken(getBearerToken(request));

  if (!(await isAdminUser(user))) {
    return null;
  }

  return user;
}

export async function requireSuperAdminFromRequest(request: Request): Promise<CurrentUser | null> {
  const user = await getUserFromAccessToken(getBearerToken(request));

  if (!user || !(await isSuperAdminUser(user))) {
    return null;
  }

  return {
    ...user,
    role: 'superadmin',
  };
}

export async function getUserFromAccessToken(
  token: string | null | undefined
): Promise<CurrentUser | null> {
  if (!token) {
    return null;
  }

  const session = verifySessionToken(token);
  if (!session || !session.userId) {
    return null;
  }

  try {
    const pool = getPool();
    const res = await pool.query('SELECT * FROM auth.users WHERE id = $1', [session.userId]);
    const row = res.rows[0];
    if (!row) {
      return null;
    }

    const metadata = row.raw_user_meta_data || {};
    const role = (await getUserRole(row.id)) || normalizeRole(metadata.role) || 'provider';

    return {
      id: row.id,
      email: row.email || null,
      name:
        typeof metadata.name === 'string'
          ? metadata.name
          : typeof metadata.full_name === 'string'
            ? metadata.full_name
            : null,
      role,
    };
  } catch (err) {
    console.error('[auth-service] getUserFromAccessToken DB error:', err);
    return null;
  }
}

export async function getPostLoginPath(user: CurrentUser | null, fallback = '/dashboard') {
  if (!user) {
    return fallback;
  }

  const role = (await getUserRole(user.id)) ?? user.role;
  if (role === 'admin' || role === 'superadmin') {
    return '/admin';
  }

  return '/dashboard';
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return header.slice(7).trim();
}
