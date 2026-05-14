import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getClinicById } from '@/services/clinic-service';
import { ClaimRequestForm } from '@/components/claim/claim-request-form';

interface ClaimPageProps {
  params: Promise<{ clinicId: string }>;
}

export const metadata: Metadata = {
  title: 'Claim Clinic Profile | Asian Health Hub',
};

export default async function ClaimPage({ params }: ClaimPageProps) {
  const { clinicId } = await params;
  const clinic = await getClinicById(clinicId);

  if (!clinic) {
    notFound();
  }

  return (
    <main className="bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <ClaimRequestForm clinic={clinic} />
      </div>
    </main>
  );
}
