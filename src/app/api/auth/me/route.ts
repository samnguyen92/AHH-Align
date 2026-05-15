import { NextResponse } from 'next/server';
import { getBearerToken, getPostLoginPath, getUserFromAccessToken, getUserRole } from '@/services/auth-service';
import { createServerSupabaseClient } from '@/services/supabase-server';

function requestedNextPath(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get('next');
  return next?.startsWith('/') ? next : null;
}

function safeDestinationForRole(role: string | null, requestedPath: string | null, defaultPath: string) {
  if (!requestedPath) {
    return defaultPath;
  }

  if (requestedPath.startsWith('/admin')) {
    return role === 'admin' || role === 'superadmin' ? requestedPath : '/dashboard';
  }

  if (requestedPath.startsWith('/dashboard')) {
    return role === 'admin' || role === 'superadmin' ? '/admin' : requestedPath;
  }

  return requestedPath;
}

export async function GET(request: Request) {
  const user = await getUserFromAccessToken(getBearerToken(request));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = (await getUserRole(user.id)) ?? user.role ?? 'provider';
  const defaultDestination = await getPostLoginPath({ ...user, role });

  return NextResponse.json({
    user: {
      ...user,
      role,
    },
    destination: safeDestinationForRole(role, requestedNextPath(request), defaultDestination),
  });
}

export async function POST(request: Request) {
  const user = await getUserFromAccessToken(getBearerToken(request));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from('user_roles')
    .upsert(
      {
        user_id: user.id,
        role: user.role === 'user' ? 'user' : 'provider',
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return GET(request);
}
