import { AuthFrame } from '@/components/site/auth-frame';
import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = {
  title: 'Reset Password',
};

export default function ResetPasswordPage() {
  return (
    <AuthFrame title="Back to your clinic profile" caption="For clinics">
      <ResetPasswordForm />
    </AuthFrame>
  );
}
