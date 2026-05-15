import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/services/supabase-server';
import { requireAdminFromRequest } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

interface AdminArticleRouteProps {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: AdminArticleRouteProps) {
  const user = await requireAdminFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = createServerSupabaseClient();

  const allowedStatus = ['draft', 'published', 'archived'];
  const nextStatus =
    typeof body.status === 'string' && allowedStatus.includes(body.status)
      ? body.status
      : undefined;

  const update = {
    title: typeof body.title === 'string' ? body.title : undefined,
    excerpt: typeof body.excerpt === 'string' ? body.excerpt : undefined,
    content: typeof body.content === 'string' ? body.content : undefined,
    category: typeof body.category === 'string' ? body.category : undefined,
    tags: Array.isArray(body.tags)
      ? body.tags.filter((tag: unknown) => typeof tag === 'string')
      : undefined,
    status: nextStatus,
    seo_meta:
      body.seo_meta && typeof body.seo_meta === 'object'
        ? body.seo_meta
        : undefined,
    published_at:
      nextStatus === 'published' ? new Date().toISOString() : undefined,
  };

  const { data, error } = await supabase
    .from('articles')
    .update(update)
    .eq('id', id)
    .select('id,slug,status')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/insights');
  if (data.slug) {
    revalidatePath(`/insights/${data.slug}`);
  }
  revalidatePath('/admin/articles');
  revalidatePath(`/admin/articles/${id}`);

  return NextResponse.json({ article: data });
}
