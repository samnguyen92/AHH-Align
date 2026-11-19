import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { safeNextPath } from '@/lib/safe-redirect';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = url.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const nextPath = safeNextPath(url.searchParams.get('next'), '/dashboard') as string;

  if (!clientId) {
    // If Google OAuth credentials are not configured, redirect back with error message
    return NextResponse.redirect(
      new URL(`/auth/login?error=Google+login+is+not+configured+yet.+Please+use+email+and+password.&next=${encodeURIComponent(nextPath)}`, request.url)
    );
  }

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', clientId);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'select_account');
  // CSRF protection: a random nonce travels in `state` and in an httpOnly cookie.
  // The callback only proceeds when both match.
  const nonce = crypto.randomBytes(16).toString('hex');
  googleAuthUrl.searchParams.set('state', `${nonce}.${encodeURIComponent(nextPath)}`);

  const response = NextResponse.redirect(googleAuthUrl.toString());
  response.cookies.set({
    name: 'ahh-oauth-state',
    value: nonce,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/google',
    maxAge: 600,
  });
  return response;
}
