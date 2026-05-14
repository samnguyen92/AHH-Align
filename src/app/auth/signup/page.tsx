import type { Metadata } from 'next';
import { SignupForm } from '@/components/auth/signup-form';

export const metadata: Metadata = {
  title: 'Create Provider Account | Asian Health Hub',
};

export default function SignupPage() {
  return (
    <main className="bg-gray-50 px-4 py-16 sm:px-6 lg:px-8">
      <SignupForm />
    </main>
  );
}
