import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserWithRole } from '@/services/auth-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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
    <main className="bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ahh-blue)]">
              Edit profile
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">
              Clinic profile manager
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Update verified information for profiles approved under your account.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm font-semibold text-[var(--ahh-blue)] hover:underline">
            Back to dashboard
          </Link>
        </div>

        <div className="space-y-6">
          <AccountSettingsForm initialName={user.name ?? ''} email={user.email ?? ''} />

          {clinics.length === 0 && (
            <section className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <h2 className="text-lg font-bold text-gray-950">No approved profiles yet</h2>
              <p className="mt-2 text-sm text-gray-600">
                Submit a claim request first. Once approved, the profile will appear here.
              </p>
              <Link href="/search" className="mt-5 inline-flex rounded-lg bg-[var(--ahh-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--ahh-blue-dark)]">
                Find your clinic
              </Link>
            </section>
          )}

          {clinics.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
              <aside className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                {clinics.map((clinic) => (
                  <Link
                    key={clinic.id}
                    href={`/dashboard/edit?clinicId=${clinic.id}`}
                    className={`block rounded-md px-3 py-2 text-sm font-medium ${
                      selectedClinic?.id === clinic.id
                        ? 'bg-blue-50 text-[var(--ahh-blue)]'
                        : 'text-gray-700 hover:bg-gray-50'
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
    </main>
  );
}
