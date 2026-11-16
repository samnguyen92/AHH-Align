import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';
import { getUserFromAccessToken, getBearerToken } from '@/services/auth-service';
import { hashPassword } from '@/lib/auth/password';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = getBearerToken(request) || cookieStore.get(AUTH_COOKIE_NAME)?.value;
    const user = await getUserFromAccessToken(token);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in to reset your password.' }, { status: 401 });
    }

    const body = await request.json();
    const password = body.password ? String(body.password) : '';

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const pool = getPool();
    await pool.query(
      'UPDATE auth.users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, user.id]
    );

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    console.error('[auth/reset-password] Error:', err);
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
  }
}
