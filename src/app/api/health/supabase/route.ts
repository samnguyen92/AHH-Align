import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serverKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseKey = publicKey || serverKey;

  const base = {
    env: {
      hasUrl: Boolean(supabaseUrl),
      hasPublicKey: Boolean(publicKey),
      hasServerKey: Boolean(serverKey),
      usingKey: publicKey ? 'public' : serverKey ? 'server' : 'none',
    },
  };

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      {
        ...base,
        database: {
          ok: false,
          message: 'Missing Supabase URL or API key in Vercel environment variables.',
        },
      },
      { status: 200 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const [clinics, articles] = await Promise.all([
    supabase.from('clinics').select('id', { count: 'exact', head: true }),
    supabase.from('articles').select('id', { count: 'exact', head: true }),
  ]);

  return NextResponse.json(
    {
      ...base,
      database: {
        ok: !clinics.error && !articles.error,
        clinicsCount: clinics.count ?? 0,
        articlesCount: articles.count ?? 0,
        clinicsError: clinics.error
          ? { code: clinics.error.code, message: clinics.error.message }
          : null,
        articlesError: articles.error
          ? { code: articles.error.code, message: articles.error.message }
          : null,
      },
    },
    { status: 200 }
  );
}
