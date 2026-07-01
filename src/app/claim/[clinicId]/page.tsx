import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getClinicById } from '@/services/clinic-service';
import { ClaimClinicLayout } from '@/components/claim/claim-clinic-layout';

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

  return <ClaimClinicLayout clinic={clinic} />;
}
