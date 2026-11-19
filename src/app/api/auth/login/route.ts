import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken } from '@/lib/auth/token';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body.email ? String(body.email).trim().toLowerCase() : '';
    const password = body.password ? String(body.password) : '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const pool = getPool();
    const res = await pool.query('SELECT * FROM auth.users WHERE LOWER(email) = $1', [email]);
    const userRow = res.rows[0];

    if (!userRow) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, userRow.encrypted_password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Checked only AFTER the password so that nobody can probe which accounts are disabled.
    if (userRow.disabled_at) {
      return NextResponse.json({ error: 'This account has been disabled. Please contact support.' }, { status: 403 });
    }

    // Best effort: the column is created on first start and must never block a sign-in.
    pool.query('UPDATE auth.users SET last_sign_in_at = NOW() WHERE id = $1', [userRow.id]).catch(() => undefined);

    // Fetch user role
    const roleRes = await pool.query('SELECT role FROM public.user_roles WHERE user_id = $1', [userRow.id]);
    const role = roleRes.rows[0]?.role || (userRow.raw_user_meta_data || {}).role || 'provider';
    const metadata = userRow.raw_user_meta_data || {};
    const name = metadata.name || metadata.full_name || null;

    const user = {
      id: userRow.id,
      email: userRow.email,
      name,
      role,
    };

    const token = createSessionToken(user);

    const response = NextResponse.json({
      user,
      session: {
        access_token: token,
      },
    });

    // Set HTTP-Only Cookie
    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: false, // allow client-side persistence and sync
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'lax',
      secure: isProd,
    });

    return response;
  } catch (err: any) {
    console.error('[auth/login] Error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
