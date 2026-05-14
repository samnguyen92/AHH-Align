import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Provider Login | Asian Health Hub',
};

export default function LoginPage() {
  return (
    <main className="bg-gray-50 px-4 py-16 sm:px-6 lg:px-8">
      <LoginForm />
    </main>
  );
}
