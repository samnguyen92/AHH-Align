'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { persistAuthToken } from '@/lib/auth/session-cookie';

function getNextPath() {
  if (typeof window === 'undefined') {
    return null;
  }

  const next = new URLSearchParams(window.location.search).get('next');
  return next?.startsWith('/') ? next : null;
}

async function getRoleDestination(token: string) {
  const next = getNextPath();
  const response = await fetch(`/api/auth/me${next ? `?next=${encodeURIComponent(next)}` : ''}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return next ?? '/dashboard';
  }

  const result = await response.json();
  return typeof result.destination === 'string' ? result.destination : next ?? '/dashboard';
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.access_token) {
        persistAuthToken(data.session.access_token);
        router.replace(await getRoleDestination(data.session.access_token));
        router.refresh();
      }
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session?.access_token) {
      setMessage(error?.message ?? 'Unable to sign in. Please try again.');
      setIsLoading(false);
      return;
    }

    persistAuthToken(data.session.access_token);
    router.push(await getRoleDestination(data.session.access_token));
    router.refresh();
  }

  async function handleGoogleLogin() {
    setIsLoading(true);
    setMessage(null);

    const redirectTo = `${window.location.origin}/auth/login`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      setMessage(error.message);
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-950">Provider Login</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign in to claim and manage your clinic profile.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <span className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-[var(--ahh-blue)] focus-within:ring-2 focus-within:ring-blue-100">
            <Mail className="h-4 w-4 text-gray-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full border-0 bg-transparent text-sm outline-none"
              placeholder="you@clinic.com"
            />
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Password</span>
          <span className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-[var(--ahh-blue)] focus-within:ring-2 focus-within:ring-blue-100">
            <Lock className="h-4 w-4 text-gray-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border-0 bg-transparent text-sm outline-none"
              placeholder="Password"
            />
          </span>
        </label>

        {message && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ahh-blue)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--ahh-blue-dark)] disabled:opacity-60"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </button>
      </form>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="mt-3 flex h-10 w-full items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60"
      >
        Continue with Google
      </button>

      <p className="mt-5 text-center text-sm text-gray-600">
        New provider?{' '}
        <Link href="/auth/signup" className="font-semibold text-[var(--ahh-blue)]">
          Create an account
        </Link>
      </p>
    </div>
  );
}
