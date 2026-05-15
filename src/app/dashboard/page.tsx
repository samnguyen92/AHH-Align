import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, Clock3, CheckCircle2, XCircle } from 'lucide-react';
import { getCurrentUserWithRole } from '@/services/auth-service';
import { createServerSupabaseClient } from '@/services/supabase-server';

export const dynamic = 'force-dynamic';

interface ClaimRow {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  proof_type: string | null;
  created_at: string;
  clinics:
    | {
        id: string;
        name: string;
        slug: string | null;
        city: string | null;
        state: string | null;
      }
    | null;
}

function StatusIcon({ status }: { status: ClaimRow['status'] }) {
  if (status === 'approved') {
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  }
  if (status === 'rejected') {
    return <XCircle className="h-4 w-4 text-red-600" />;
  }
  return <Clock3 className="h-4 w-4 text-amber-600" />;
}

export default async function DashboardPage() {
  const user = await getCurrentUserWithRole();

  if (!user) {
    redirect('/auth/login?next=/dashboard');
  }

  if (user.role === 'admin' || user.role === 'superadmin') {
    redirect('/admin');
  }

  const supabase = createServerSupabaseClient();
  const { data: claims, error } = await supabase
    .from('claim_requests')
    .select('id,status,proof_type,created_at,clinics(id,name,slug,city,state)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const rows = ((claims ?? []) as unknown as ClaimRow[]).map((claim) => ({
    ...claim,
    clinics: Array.isArray(claim.clinics) ? claim.clinics[0] : claim.clinics,
  }));

  return (
    <main className="bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ahh-blue)]">
            Provider dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">
            Welcome{user.name ? `, ${user.name}` : ''}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Track clinic ownership requests and prepare verified profile updates.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <Building2 className="h-5 w-5 text-[var(--ahh-blue)]" />
            <p className="mt-3 text-2xl font-bold text-gray-950">{rows.length}</p>
            <p className="text-sm text-gray-600">Claim requests</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <Clock3 className="h-5 w-5 text-amber-600" />
            <p className="mt-3 text-2xl font-bold text-gray-950">
              {rows.filter((claim) => claim.status === 'pending').length}
            </p>
            <p className="text-sm text-gray-600">Pending review</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="mt-3 text-2xl font-bold text-gray-950">
              {rows.filter((claim) => claim.status === 'approved').length}
            </p>
            <p className="text-sm text-gray-600">Approved profiles</p>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-bold text-gray-950">Ownership requests</h2>
            <div className="flex gap-4">
              <Link
                href="/dashboard/edit"
                className="text-sm font-semibold text-[var(--ahh-blue)] hover:underline"
              >
                Edit profiles
              </Link>
              <Link
                href="/search"
                className="text-sm font-semibold text-[var(--ahh-blue)] hover:underline"
              >
                Find another clinic
              </Link>
            </div>
          </div>

          {error && (
            <p className="px-5 py-4 text-sm text-red-700">
              Unable to load claims: {error.message}
            </p>
          )}

          {!error && rows.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-gray-600">
                No claim requests yet. Search the directory and claim your clinic profile.
              </p>
              <Link
                href="/search"
                className="mt-4 inline-flex rounded-lg bg-[var(--ahh-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--ahh-blue-dark)]"
              >
                Search directory
              </Link>
            </div>
          )}

          {rows.length > 0 && (
            <div className="divide-y divide-gray-100">
              {rows.map((claim) => (
                <article key={claim.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusIcon status={claim.status} />
                      <h3 className="font-semibold text-gray-950">
                        {claim.clinics?.name ?? 'Clinic profile'}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {claim.clinics?.city}, {claim.clinics?.state} · {claim.proof_type?.replaceAll('_', ' ') ?? 'verification'}
                    </p>
                  </div>
                  <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold capitalize text-gray-700">
                    {claim.status}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
