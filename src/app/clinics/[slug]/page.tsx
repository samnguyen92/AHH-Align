import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getClinicBySlug } from '@/services/clinic-service';
import { getCurrentUser, isAdminUser } from '@/services/auth-service';
import { ClinicPage as ClinicProfile } from '@/components/site/clinic';
import { getClinicPageData } from '@/lib/site-data';

export const revalidate = 3600;

interface ClinicPageProps {
  params: Promise<{
    slug: string;
  }>;
}

/** Admins may preview a draft/archived clinic before approving it; visitors never can. */
async function loadClinic(slug: string) {
  const isAdmin = await isAdminUser(await getCurrentUser());
  return getClinicBySlug(slug, { includeUnpublished: isAdmin });
}

export async function generateMetadata({ params }: ClinicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const clinic = await loadClinic(slug);

  if (!clinic) {
    return {
      title: 'Clinic Not Found',
    };
  }

  return {
    // A preview of an unpublished clinic must never be indexed.
    ...(clinic.status && clinic.status !== 'published' ? { robots: { index: false, follow: false } } : {}),
    title: clinic.name,
    description: clinic.description || `View reviews, languages spoken, and services offered by ${clinic.name} in ${clinic.city}, ${clinic.state}.`,
    openGraph: {
      title: `${clinic.name} - ${clinic.specialty || 'Healthcare Provider'}`,
      description: `Find ${clinic.languages.join(', ')}-speaking healthcare at ${clinic.name}.`,
    },
  };
}

export default async function ClinicPage({ params }: ClinicPageProps) {
  const { slug } = await params;
  const clinic = await loadClinic(slug);

  if (!clinic) {
    notFound();
  }

  const data = await getClinicPageData(clinic);
  return <ClinicProfile data={data} />;
}
