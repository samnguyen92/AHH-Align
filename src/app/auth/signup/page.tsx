import { AuthFrame } from '@/components/site/auth-frame';
import type { Metadata } from 'next';
import { SignupForm } from '@/components/auth/signup-form';

export const metadata: Metadata = {
  title: 'Create Provider Account',
};

export default function SignupPage() {
  return (
    <AuthFrame title="Reach patients in their language" caption="For clinics">
      <SignupForm />
    </AuthFrame>
  );
}
