'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { persistAuthToken } from '@/lib/auth/session-cookie';

const inputClass =
  'mt-2 h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]';

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<{ email: string; role: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok) setInvite({ email: data.email, role: data.role });
        else setMessage(data.error ?? 'This invite link is invalid or has expired.');
      })
      .catch(() => active && setMessage('Network error. Please try again.'))
      .finally(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setMessage('The two passwords do not match.');
      return;
    }
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session?.access_token) {
        setMessage(data.error ?? 'Unable to create the account. Please try again.');
        setIsLoading(false);
        return;
      }
      persistAuthToken(data.session.access_token);
      router.push(data.user?.role === 'admin' || data.user?.role === 'superadmin' ? '/admin' : '/dashboard');
      router.refresh();
    } catch {
      setMessage('Network error. Please try again.');
      setIsLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="mx-auto flex w-full max-w-md justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Checking your invitation" />
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl font-bold leading-tight tracking-tight">Invitation not valid</h1>
        <p className="mt-3 text-sm font-medium opacity-80" role="alert">
          {message ?? 'This invite link is invalid or has expired.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6">
        <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">Set up your account</h1>
        <p className="mt-2 text-sm font-medium opacity-70">
          You were invited as <strong>{invite.role}</strong> with <strong>{invite.email}</strong>. Choose a password to
          finish.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="text-sm font-bold">Full name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="name" />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Repeat password</span>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
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
          Create my account
        </button>
      </form>
    </div>
  );
}
