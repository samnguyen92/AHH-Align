import { AuthFrame } from '@/components/site/auth-frame';
import type { Metadata } from 'next';
import { AcceptInviteForm } from '@/components/auth/accept-invite-form';

export const metadata: Metadata = {
  title: 'Accept your invitation',
  // The URL contains a one-time token: never index it and never leak it through the Referer header.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthFrame title="Welcome to Asian Health Hub" caption="Invitation">
      <AcceptInviteForm token={typeof token === 'string' ? token : ''} />
    </AuthFrame>
  );
}
