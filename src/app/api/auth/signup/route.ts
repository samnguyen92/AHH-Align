import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/db/postgres';
import { hashPassword } from '@/lib/auth/password';
import { createSessionToken } from '@/lib/auth/token';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body.email ? String(body.email).trim().toLowerCase() : '';
    const password = body.password ? String(body.password) : '';
    const name = body.name ? String(body.name).trim() : '';
    const requestedRole = body.role === 'admin' ? 'provider' : body.role || 'provider';

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const pool = getPool();
    // Check if user already exists
    const existing = await pool.query('SELECT id FROM auth.users WHERE LOWER(email) = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const userId = crypto.randomUUID();
    const userMetadata = {
      name,
      role: requestedRole,
      email_verified: false,
    };

    // Insert user into auth.users
    await pool.query(
      `INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [userId, email, hashedPassword, JSON.stringify(userMetadata)]
    );

    // Insert user role into public.user_roles
    await pool.query(
      `INSERT INTO public.user_roles (user_id, role, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, requestedRole]
    );

    const user = {
      id: userId,
      email,
      name,
      role: requestedRole,
    };

    const token = createSessionToken(user);

    const response = NextResponse.json({
      user,
      session: {
        access_token: token,
      },
    });

    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: false,
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: isProd,
    });

    return response;
  } catch (err: any) {
    console.error('[auth/signup] Error:', err);
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
  }
}
