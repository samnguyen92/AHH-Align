import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getClinicBySlug } from '@/services/clinic-service';
import { ClinicPage as ClinicProfile } from '@/components/site/clinic';
import { getClinicPageData } from '@/lib/site-data';

export const revalidate = 3600;

interface ClinicPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: ClinicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const clinic = await getClinicBySlug(slug);

  if (!clinic) {
    return {
      title: 'Clinic Not Found',
    };
  }

  return {
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
  const clinic = await getClinicBySlug(slug);

  if (!clinic) {
    notFound();
  }

  const data = await getClinicPageData(clinic);
  return <ClinicProfile data={data} />;
}
