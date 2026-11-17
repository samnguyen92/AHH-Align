import type { Metadata } from 'next';

// /claim is a client page, so its title lives here; /claim/[clinicId] sets its own.
export const metadata: Metadata = {
  title: { default: 'Claim Your Free Clinic Profile', template: '%s | Asian Health Hub' },
  description: 'Claim or submit your clinic on Asian Health Hub to reach Vietnamese, Korean and Chinese-speaking patients. Free.',
};

export default function ClaimLayout({ children }: { children: React.ReactNode }) {
  return children;
}
