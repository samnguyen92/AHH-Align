import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth/session-cookie';

export function proxy(request: NextRequest) {
  const hasAuthToken = Boolean(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  if (!hasAuthToken) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
