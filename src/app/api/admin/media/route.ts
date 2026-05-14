import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

const DEFAULT_BUCKET = 'generated-images';
const LIBRARY_PREFIXES = ['generated-insights', 'admin-uploads/articles'];

function getBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;
}

function safeFileName(value: string) {
  const [baseName, ...extensionParts] = value.split('.');
  const extension = extensionParts.pop()?.toLowerCase() || 'jpg';
  const safeBaseName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${safeBaseName || 'image'}-${Date.now()}.${extension}`;
}

function publicUrlForPath(path: string) {
  const supabase = createServerSupabaseClient();
  const bucket = getBucketName();
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function GET(request: NextRequest) {
  const user = await requireAdminFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const bucket = getBucketName();
  const media = [];

  for (const prefix of LIBRARY_PREFIXES) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });

    if (error) {
      console.error(`[admin-media] list ${prefix} error:`, error);
      continue;
    }

    for (const item of data ?? []) {
      if (!item.name || item.name === '.emptyFolderPlaceholder') {
        continue;
      }

      const path = `${prefix}/${item.name}`;
      media.push({
        name: item.name,
        path,
        url: publicUrlForPath(path),
        size: item.metadata?.size ?? null,
        created_at: item.created_at ?? null,
      });
    }
  }

  return NextResponse.json({ bucket, media });
}

export async function POST(request: NextRequest) {
  const user = await requireAdminFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing image file.' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are supported.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const bucket = getBucketName();
  const path = `admin-uploads/articles/${safeFileName(file.name)}`;
  const buffer = await file.arrayBuffer();

  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    media: {
      name: file.name,
      path,
      url: publicUrlForPath(path),
      size: file.size,
      created_at: new Date().toISOString(),
    },
  });
}
