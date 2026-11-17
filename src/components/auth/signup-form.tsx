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
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6">
        <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">Create Account</h1>
        <p className="mt-2 text-sm font-medium opacity-70">
          Start a provider account to request ownership of a clinic profile.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="text-sm font-bold">Full name</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
            placeholder="Clinic owner or manager"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
            placeholder="you@clinic.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
            placeholder="At least 8 characters"
          />
        </label>

        {message && (
          <p className="rounded-xl bg-[#E3F1EC] px-4 py-3 text-sm font-semibold text-[#024E44]" role="status">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#024E44] px-6 text-sm font-bold text-white btn-fx disabled:opacity-60"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </button>
      </form>

      <p className="mt-6 text-center text-sm font-medium opacity-80">
        Already have an account?{' '}
        <Link href="/auth/login" className="font-bold text-[#024E44] underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
