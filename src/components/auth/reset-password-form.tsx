'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2, CheckCircle } from 'lucide-react';

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters long.");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error ?? 'Failed to update password');
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      setIsLoading(false);

      setTimeout(() => {
        router.push('/auth/login');
      }, 3000);
    } catch {
      setMessage('Network error. Please try again.');
      setIsLoading(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="mx-auto w-full max-w-md rounded-lg border border-green-200 bg-green-50 p-6 text-center shadow-sm">
        <CheckCircle className="mx-auto h-12 w-12 text-green-600 animate-bounce" />
        <h1 className="mt-4 text-2xl font-bold text-green-950">Password Updated!</h1>
        <p className="mt-2 text-sm text-green-800">
          Your password has been successfully reset. Redirecting you to the login page...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6">
        <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">Reset Password</h1>
        <p className="mt-2 text-sm font-medium opacity-70">
          Please enter your new password below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="text-sm font-bold">New Password</span>
          <span className="mt-2 flex items-center gap-3 rounded-full bg-stone-50 px-5 ring-1 ring-[#0D1F1C]/10 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#024E44]">
            <Lock className="h-4 w-4 shrink-0 opacity-45" />
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full border-0 bg-transparent text-base font-medium outline-none placeholder:text-[#0D1F1C]/40"
              placeholder="Minimum 6 characters"
            />
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-bold">Confirm Password</span>
          <span className="mt-2 flex items-center gap-3 rounded-full bg-stone-50 px-5 ring-1 ring-[#0D1F1C]/10 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#024E44]">
            <Lock className="h-4 w-4 shrink-0 opacity-45" />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 w-full border-0 bg-transparent text-base font-medium outline-none placeholder:text-[#0D1F1C]/40"
              placeholder="Confirm Password"
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
          className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#024E44] px-6 text-sm font-bold text-white btn-fx disabled:opacity-60"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Update Password
        </button>
      </form>
    </div>
  );
}
