import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = url.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const nextPath = url.searchParams.get('next') || '/dashboard';

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
  googleAuthUrl.searchParams.set('state', encodeURIComponent(nextPath));

  return NextResponse.redirect(googleAuthUrl.toString());
}
