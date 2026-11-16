import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminFromRequest } from '@/services/auth-service';
import { listLocalFiles, saveLocalFile, type StoredMediaItem } from '@/lib/storage/local';

export const dynamic = 'force-dynamic';

const LIBRARY_PREFIXES = ['generated-insights', 'admin-uploads/articles', 'generated-clinics'];

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

export async function GET(request: NextRequest) {
  const user = await requireAdminFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const media: StoredMediaItem[] = [];

  for (const prefix of LIBRARY_PREFIXES) {
    const items = await listLocalFiles(prefix, 100);
    media.push(...items);
  }

  return NextResponse.json({ bucket: 'local-uploads', media });
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

  const fileName = safeFileName(file.name);
  const buffer = await file.arrayBuffer();

  try {
    const item = await saveLocalFile('admin-uploads/articles', buffer, fileName);
    return NextResponse.json({ media: item });
  } catch (err: any) {
    console.error('[admin-media] Upload error:', err);
    return NextResponse.json({ error: err.message || 'Failed to save file' }, { status: 500 });
  }
}
