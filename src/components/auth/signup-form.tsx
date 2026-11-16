'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { persistAuthToken } from '@/lib/auth/session-cookie';

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, role: 'provider' }),
      });

      const data = await res.json();

      if (!res.ok || !data.session?.access_token) {
        setMessage(data?.error ?? 'Unable to create account. Please try again.');
        setIsLoading(false);
        return;
      }

      persistAuthToken(data.session.access_token);
      router.push('/dashboard');
      router.refresh();
    } catch {
      setMessage('Network error. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-950">Create Account</h1>
        <p className="mt-2 text-sm text-gray-600">
          Start a provider account to request ownership of a clinic profile.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Full name</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100"
            placeholder="Clinic owner or manager"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100"
            placeholder="you@clinic.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100"
            placeholder="At least 8 characters"
          />
        </label>

        {message && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ahh-blue)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--ahh-blue-dark)] disabled:opacity-60"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/auth/login" className="font-semibold text-[var(--ahh-blue)]">
          Sign in
        </Link>
      </p>
    </div>
  );
}
