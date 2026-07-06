import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = {
  title: 'Reset Password | Asian Health Hub',
};

export default function ResetPasswordPage() {
  return (
    <main className="bg-gray-50 px-4 py-16 sm:px-6 lg:px-8">
      <ResetPasswordForm />
    </main>
  );
}
