import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getClinicBySlug } from '@/services/clinic-service';
import { ClinicHero } from '@/components/clinic/clinic-hero';
import { ClinicMainContent } from '@/components/clinic/clinic-main-content';
import { ClinicSidebar } from '@/components/clinic/clinic-sidebar';

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
    title: `${clinic.name} | Asian Health Hub`,
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

  return (
    <>
      <ClinicHero clinic={clinic} />
      
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Left Column: Main Content */}
          <ClinicMainContent clinic={clinic} />

          {/* Right Column: Sidebar */}
          <ClinicSidebar clinic={clinic} />
        </div>
      </div>
    </>
  );
}
