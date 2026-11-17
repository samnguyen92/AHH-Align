import { AuthFrame } from '@/components/site/auth-frame';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Provider Login',
};

export default function LoginPage() {
  return (
    <AuthFrame title="Manage your clinic profile" caption="For clinics">
      <LoginForm />
    </AuthFrame>
  );
}
