import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminFromRequest } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

const ALLOWED_ACTIONS = new Set(['run_pipeline', 'pause_pipeline', 'restart_pipeline']);

export async function POST(request: NextRequest) {
  const user = await requireAdminFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const body = (await request.json()) as { action?: string };
  const action = body.action;

  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Invalid pipeline action.' }, { status: 400 });
  }

  const baseUrl = process.env.OPENCLAW_API_URL;

  if (!baseUrl) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      action,
      message: 'OPENCLAW_API_URL is not configured. Action accepted in dry-run mode.',
    });
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/pipeline/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.OPENCLAW_API_TOKEN
        ? { Authorization: `Bearer ${process.env.OPENCLAW_API_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ requested_by: user.email ?? user.id }),
  });

  const text = await response.text();

  return NextResponse.json(
    {
      ok: response.ok,
      action,
      upstream_status: response.status,
      upstream_body: text.slice(0, 2000),
    },
    { status: response.ok ? 200 : 502 }
  );
}
