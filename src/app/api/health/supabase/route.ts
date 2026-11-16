import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pool = getPool();
    const [clinicsRes, articlesRes] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM clinics'),
      pool.query('SELECT COUNT(*) AS total FROM articles'),
    ]);

    const clinicsCount = parseInt(clinicsRes.rows[0]?.total || '0', 10);
    const articlesCount = parseInt(articlesRes.rows[0]?.total || '0', 10);

    return NextResponse.json({
      status: 'healthy',
      database: {
        engine: 'PostgreSQL 16 + pgvector (self-hosted)',
        ok: true,
        clinicsCount,
        articlesCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        database: {
          ok: false,
          error: err.message || 'Could not connect to PostgreSQL database',
        },
      },
      { status: 500 }
    );
  }
}
