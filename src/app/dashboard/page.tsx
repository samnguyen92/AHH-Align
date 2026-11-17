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

  if (user.email) {
    const userEmail = user.email.toLowerCase().trim();

    // 1. Find claims that are approved and have no user_id, update their clinics
    const { data: unclaimedApproved } = await supabase
      .from('claim_requests')
      .select('id, clinic_id')
      .is('user_id', null)
      .eq('status', 'approved')
      .eq('proof_data->>email', userEmail);

    if (unclaimedApproved && unclaimedApproved.length > 0) {
      const clinicIds = unclaimedApproved.map(c => c.clinic_id).filter(Boolean);
      if (clinicIds.length > 0) {
        await supabase
          .from('clinics')
          .update({ claimed_by: user.id })
          .in('id', clinicIds);
      }
    }

    // 2. Link the claim requests to the user
    await supabase
      .from('claim_requests')
      .update({ user_id: user.id })
      .is('user_id', null)
      .eq('proof_data->>email', userEmail);
  }

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
    <div className="site-a bg-white px-3 pb-6 pt-20 text-[#0D1F1C] md:px-5 md:pt-[5.375rem]">
      <div className="mx-auto max-w-[90rem]">
        <div className="mb-1.5 rounded-xl bg-stone-50 p-5 md:mb-2 md:rounded-2xl md:p-7">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-55">
            Provider dashboard
          </p>
          <h1 className="mt-3 text-[clamp(2.25rem,4.5vw,4rem)] font-bold leading-[0.95] tracking-tight">
            Welcome{user.name ? `, ${user.name}` : ''}
          </h1>
          <p className="mt-2 text-sm text-[#0D1F1C]/70">
            Track clinic ownership requests and prepare verified profile updates.
          </p>
        </div>

        <section className="grid gap-2 md:grid-cols-3 md:gap-3">
          <div className="rounded-xl bg-[#E3F1EC] p-5 md:rounded-2xl md:p-6">
            <Building2 className="h-5 w-5 text-[#024E44]" />
            <p className="mt-3 text-2xl font-bold text-[#0D1F1C]">{rows.length}</p>
            <p className="text-sm text-[#0D1F1C]/70">Claim requests</p>
          </div>
          <div className="rounded-xl bg-[#E3F1EC] p-5 md:rounded-2xl md:p-6">
            <Clock3 className="h-5 w-5 text-amber-600" />
            <p className="mt-3 text-2xl font-bold text-[#0D1F1C]">
              {rows.filter((claim) => claim.status === 'pending').length}
            </p>
            <p className="text-sm text-[#0D1F1C]/70">Pending review</p>
          </div>
          <div className="rounded-xl bg-[#E3F1EC] p-5 md:rounded-2xl md:p-6">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="mt-3 text-2xl font-bold text-[#0D1F1C]">
              {rows.filter((claim) => claim.status === 'approved').length}
            </p>
            <p className="text-sm text-[#0D1F1C]/70">Approved profiles</p>
          </div>
        </section>

        <section className="mt-1.5 overflow-hidden rounded-xl bg-white ring-1 ring-[#0D1F1C]/10 md:mt-2 md:rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#0D1F1C]/10 px-5 py-4">
            <h2 className="text-lg font-bold text-[#0D1F1C]">Ownership requests</h2>
            <div className="flex gap-4">
              <Link
                href="/dashboard/edit"
                className="text-sm font-semibold text-[#024E44] hover:underline"
              >
                Edit profiles
              </Link>
              <Link
                href="/search"
                className="text-sm font-semibold text-[#024E44] hover:underline"
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
              <p className="text-sm text-[#0D1F1C]/70">
                No claim requests yet. Search the directory and claim your clinic profile.
              </p>
              <Link
                href="/search"
                className="mt-4 inline-flex rounded-full bg-[#024E44] px-6 py-3 text-sm font-bold text-white btn-fx"
              >
                Search directory
              </Link>
            </div>
          )}

          {rows.length > 0 && (
            <div className="divide-y divide-[#0D1F1C]/10">
              {rows.map((claim) => (
                <article key={claim.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusIcon status={claim.status} />
                      <h3 className="font-semibold text-[#0D1F1C]">
                        {claim.clinics?.name ?? 'Clinic profile'}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-[#0D1F1C]/70">
                      {claim.clinics?.city}, {claim.clinics?.state} · {claim.proof_type?.replaceAll('_', ' ') ?? 'verification'}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#0D1F1C]/15 px-3 py-1 text-xs font-semibold capitalize text-[#0D1F1C]/80">
                    {claim.status}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
