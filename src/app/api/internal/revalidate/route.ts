import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkRevalidateRequest } from '@/lib/revalidate-guard';
import { clearDirectoryCaches } from '@/services/clinic-service';

// Called only by the OpenClaw bot (server to server) right after it changes clinic data.
export async function POST(request: Request) {
  let paths: unknown;
  try {
    paths = (await request.json()).paths;
  } catch {
    paths = undefined;
  }
  const decision = checkRevalidateRequest(
    request.headers.get('x-revalidate-secret') || '',
    process.env.REVALIDATE_SECRET || '',
    paths,
  );
  if (!decision.ok) {
    return NextResponse.json({ error: decision.status === 404 ? 'Not found' : 'Bad request' }, { status: decision.status });
  }
  clearDirectoryCaches(); // the shared city/specialty/filter lists may have changed too
  for (const p of decision.paths) revalidatePath(p);
  return NextResponse.json({ ok: true, revalidated: decision.paths });
}
