import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserWithRole } from '@/services/auth-service';
import { createServerSupabaseClient } from '@/services/supabase-server';
import { ClinicEditForm } from '@/components/dashboard/clinic-edit-form';
import { AccountSettingsForm } from '@/components/dashboard/account-settings-form';
import type { Clinic } from '@/types/database';

export const dynamic = 'force-dynamic';

interface EditDashboardProps {
  searchParams: Promise<{ clinicId?: string }>;
}

interface ClaimWithClinic {
  clinics: Clinic | Clinic[] | null;
}

export default async function DashboardEditPage({ searchParams }: EditDashboardProps) {
  const user = await getCurrentUserWithRole();
  if (!user) {
    redirect('/auth/login?next=/dashboard/edit');
  }

  if (user.role === 'admin' || user.role === 'superadmin') {
    redirect('/admin');
  }

  const { clinicId } = await searchParams;
  const supabase = createServerSupabaseClient();

  const { data: ownedClinics } = await supabase
    .from('clinics')
    .select('*')
    .eq('claimed_by', user.id)
    .order('created_at', { ascending: false });

  const { data: approvedClaims } = await supabase
    .from('claim_requests')
    .select('clinics(*)')
    .eq('user_id', user.id)
    .eq('status', 'approved');

  const approvedClinics = ((approvedClaims ?? []) as unknown as ClaimWithClinic[])
    .flatMap((claim) => {
      if (!claim.clinics) {
        return [];
      }
      return Array.isArray(claim.clinics) ? claim.clinics : [claim.clinics];
    });

  const clinicsById = new Map<string, Clinic>();
  [...((ownedClinics ?? []) as Clinic[]), ...approvedClinics].forEach((clinic) => {
    clinicsById.set(clinic.id, clinic);
  });

  const clinics = [...clinicsById.values()];
  const selectedClinic = clinicId
    ? clinics.find((clinic) => clinic.id === clinicId)
    : clinics[0];

  return (
    <div className="site-a bg-white px-3 pb-6 pt-20 text-[#0D1F1C] md:px-5 md:pt-[5.375rem]">
      <div className="mx-auto max-w-[90rem]">
        <div className="mb-1.5 flex flex-col gap-4 rounded-xl bg-stone-50 p-5 sm:flex-row sm:items-end sm:justify-between md:mb-2 md:rounded-2xl md:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-55">
              Edit profile
            </p>
            <h1 className="mt-3 text-[clamp(2.25rem,4.5vw,4rem)] font-bold leading-[0.95] tracking-tight">
              Clinic profile manager
            </h1>
            <p className="mt-2 text-sm text-[#0D1F1C]/70">
              Update verified information for profiles approved under your account.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm font-semibold text-[#024E44] hover:underline">
            Back to dashboard
          </Link>
        </div>

        <div className="space-y-6">
          <AccountSettingsForm initialName={user.name ?? ''} email={user.email ?? ''} />

          {clinics.length === 0 && (
            <section className="rounded-xl bg-stone-50 p-8 text-center md:rounded-2xl">
              <h2 className="text-lg font-bold text-[#0D1F1C]">No approved profiles yet</h2>
              <p className="mt-2 text-sm text-[#0D1F1C]/70">
                Submit a claim request first. Once approved, the profile will appear here.
              </p>
              <Link href="/search" className="mt-5 inline-flex rounded-full bg-[#024E44] px-6 py-3 text-sm font-bold text-white btn-fx">
                Find your clinic
              </Link>
            </section>
          )}

          {clinics.length > 0 && (
            <div className="grid gap-2 md:gap-3 lg:grid-cols-[240px_1fr]">
              <aside className="rounded-xl bg-stone-50 p-3 md:rounded-2xl">
                {clinics.map((clinic) => (
                  <Link
                    key={clinic.id}
                    href={`/dashboard/edit?clinicId=${clinic.id}`}
                    className={`block rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                      selectedClinic?.id === clinic.id
                        ? 'bg-[#0D1F1C] text-white'
                        : 'hover:bg-[#E3F1EC]'
                    }`}
                  >
                    {clinic.name}
                  </Link>
                ))}
              </aside>

              {selectedClinic && <ClinicEditForm clinic={selectedClinic} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
