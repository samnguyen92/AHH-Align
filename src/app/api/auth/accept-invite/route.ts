import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/db/postgres';
import { hashPassword } from '@/lib/auth/password';
import { createSessionToken } from '@/lib/auth/token';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';

export const dynamic = 'force-dynamic';

// Tokens are created by the bot (secrets.token_urlsafe(32)); only their SHA-256 hash is stored.
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
const INVALID = 'This invite link is invalid or has expired. Ask for a new one.';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** GET /api/auth/accept-invite?token=…  → which e-mail/role the invite is for (does not use it up). */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: INVALID }, { status: 404 });
  }

  try {
    const res = await getPool().query(
      `SELECT email, role FROM public.user_invites
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [hashToken(token)]
    );
    if (!res.rows[0]) {
      return NextResponse.json({ error: INVALID }, { status: 404 });
    }
    return NextResponse.json({ email: res.rows[0].email, role: res.rows[0].role });
  } catch (err) {
    console.error('[auth/accept-invite] lookup failed:', err);
    return NextResponse.json({ error: INVALID }, { status: 404 });
  }
}

/** POST { token, password, name } → creates the account for the invited e-mail, once. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown; password?: unknown; name?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';

  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: INVALID }, { status: 404 });
  }
  if (password.length < 8 || password.length > 200) {
    return NextResponse.json({ error: 'Password must be 8 to 200 characters long.' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // Claim the invite atomically: a second request with the same link finds nothing to claim.
    const claimed = await client.query(
      `UPDATE public.user_invites SET used_at = NOW()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING id, email, role`,
      [hashToken(token)]
    );
    const invite = claimed.rows[0];
    if (!invite) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: INVALID }, { status: 404 });
    }

    const existing = await client.query('SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER($1)', [invite.email]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'An account with this e-mail already exists. Please sign in.' }, { status: 409 });
    }

    const userId = crypto.randomUUID();
    await client.query(
      `INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())`,
      [userId, String(invite.email).toLowerCase(), passwordHash, JSON.stringify({ name, email_verified: true, invited: true })]
    );
    await client.query(
      `INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`,
      [userId, invite.role]
    );
    await client.query(
      `INSERT INTO public.audit_log (actor, action, target_type, target_id, target_label, details)
       VALUES ($1, 'user.invite_accepted', 'user', $2, $3, $4)`,
      [`user:${userId}`, userId, invite.email, JSON.stringify({ role: invite.role })]
    );
    await client.query('COMMIT');

    const user = { id: userId, email: String(invite.email).toLowerCase(), name, role: invite.role as string };
    const sessionToken = createSessionToken(user);
    const response = NextResponse.json({ user, session: { access_token: sessionToken } });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: sessionToken,
      httpOnly: false,
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[auth/accept-invite] failed:', err);
    return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 500 });
  } finally {
    client.release();
  }
}
