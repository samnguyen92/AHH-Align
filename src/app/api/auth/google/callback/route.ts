import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/db/postgres';
import { createSessionToken } from '@/lib/auth/token';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';
import { safeNextPath } from '@/lib/safe-redirect';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  // `state` is `<nonce>.<encoded next path>`; the nonce must match the httpOnly cookie
  // set when the flow started, otherwise this is a forged/cross-site callback.
  const [stateNonce, ...stateRest] = (state ?? '').split('.');
  const cookieNonce = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('ahh-oauth-state='))
    ?.slice('ahh-oauth-state='.length);

  if (!stateNonce || !cookieNonce || stateNonce !== cookieNonce) {
    return NextResponse.redirect(new URL('/auth/login?error=Google+login+failed', request.url));
  }

  let decodedNext = '/dashboard';
  try {
    decodedNext = decodeURIComponent(stateRest.join('.'));
  } catch {
    // keep default
  }
  const nextPath = safeNextPath(decodedNext, '/dashboard') as string;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const origin = url.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  if (!code || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL(`/auth/login?error=Google+login+failed`, request.url));
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Google OAuth] Token exchange error:', errText);
      return NextResponse.redirect(new URL(`/auth/login?error=Failed+to+exchange+Google+token`, request.url));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google
    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return NextResponse.redirect(new URL(`/auth/login?error=Failed+to+fetch+Google+profile`, request.url));
    }

    const profile = await profileRes.json();
    // Only trust an email Google has verified; otherwise an attacker could register a Google
    // account with someone else's address and be merged into that user's account.
    if (profile.email_verified === false) {
      return NextResponse.redirect(new URL('/auth/login?error=Google+email+is+not+verified', request.url));
    }
    const email = profile.email ? String(profile.email).toLowerCase() : null;
    const name = profile.name || profile.given_name || null;
    const googleId = profile.sub;

    if (!email) {
      return NextResponse.redirect(new URL(`/auth/login?error=Google+account+has+no+email`, request.url));
    }

    const pool = getPool();
    // 3. Upsert user into auth.users in PostgreSQL
    const existing = await pool.query('SELECT * FROM auth.users WHERE LOWER(email) = $1', [email]);
    let userId: string;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      // Update Google metadata
      const currentMeta = existing.rows[0].raw_user_meta_data || {};
      await pool.query(
        `UPDATE auth.users 
         SET raw_user_meta_data = $1, updated_at = NOW() 
         WHERE id = $2`,
        [JSON.stringify({ ...currentMeta, google_id: googleId, name: name || currentMeta.name }), userId]
      );
    } else {
      userId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [userId, email, null, JSON.stringify({ name, google_id: googleId, role: 'provider', email_verified: true })]
      );
      await pool.query(
        `INSERT INTO public.user_roles (user_id, role, created_at)
         VALUES ($1, 'provider', NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
    }

    // 4. Fetch role
    const roleRes = await pool.query('SELECT role FROM public.user_roles WHERE user_id = $1', [userId]);
    const role = roleRes.rows[0]?.role || 'provider';

    const user = { id: userId, email, name, role };
    const sessionToken = createSessionToken(user);

    // 5. Redirect and set cookie
    const isProd = process.env.NODE_ENV === 'production';
    const redirectUrl = new URL(nextPath, request.url);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set({ name: 'ahh-oauth-state', value: '', path: '/api/auth/google', maxAge: 0 });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: sessionToken,
      httpOnly: false,
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: isProd,
    });

    return response;
  } catch (err: any) {
    console.error('[Google OAuth] Callback error:', err);
    return NextResponse.redirect(new URL(`/auth/login?error=Google+login+failed`, request.url));
  }
}
