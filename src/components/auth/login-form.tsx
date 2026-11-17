'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Loader2 } from 'lucide-react';
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
    // Check if URL contains error (e.g. from Google OAuth)
    if (typeof window !== 'undefined') {
      const err = new URLSearchParams(window.location.search).get('error');
      if (err) {
        setMessage(err);
      }
    }

    // Check existing session
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then(async (data) => {
        if (data?.user?.id) {
          const dest = data.destination || (data.user.role === 'admin' || data.user.role === 'superadmin' ? '/admin' : '/dashboard');
          router.replace(dest);
          router.refresh();
        }
      })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.session?.access_token) {
        setMessage(data?.error ?? 'Unable to sign in. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      persistAuthToken(data.session.access_token);
      router.push(await getRoleDestination(data.session.access_token));
      router.refresh();
    } catch {
      setMessage('Network error. Please try again.');
      setIsLoading(false);
    }
  }

  function handleGoogleLogin() {
    setIsLoading(true);
    const next = getNextPath() || '/dashboard';
    window.location.href = `/api/auth/google?next=${encodeURIComponent(next)}`;
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6">
        <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">Provider Login</h1>
        <p className="mt-2 text-sm font-medium opacity-70">
          Sign in to claim and manage your clinic profile.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="text-sm font-bold">Email</span>
          <span className="mt-2 flex items-center gap-3 rounded-full bg-stone-50 px-5 ring-1 ring-[#0D1F1C]/10 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#024E44]">
            <Mail className="h-4 w-4 shrink-0 opacity-45" />
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full border-0 bg-transparent text-base font-medium outline-none placeholder:text-[#0D1F1C]/40"
              placeholder="you@clinic.com"
            />
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-bold">Password</span>
          <span className="mt-2 flex items-center gap-3 rounded-full bg-stone-50 px-5 ring-1 ring-[#0D1F1C]/10 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#024E44]">
            <Lock className="h-4 w-4 shrink-0 opacity-45" />
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full border-0 bg-transparent text-base font-medium outline-none placeholder:text-[#0D1F1C]/40"
              placeholder="Password"
            />
          </span>
        </label>

        {message && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#024E44] px-6 text-sm font-bold text-white btn-fx disabled:opacity-60"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </button>
      </form>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-full border border-[#0D1F1C]/25 px-6 text-sm font-bold transition-colors hover:border-[#0D1F1C] disabled:opacity-60"
      >
        Continue with Google
      </button>

      <p className="mt-6 text-center text-sm font-medium opacity-80">
        New provider?{' '}
        <Link href="/auth/signup" className="font-bold text-[#024E44] underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </div>
  );
}
