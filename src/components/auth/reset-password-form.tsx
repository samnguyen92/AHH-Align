'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/services/supabase-client';

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

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setMessage(error.message);
      setIsLoading(false);
      return;
    }

    setIsSuccess(true);
    setIsLoading(false);

    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push('/auth/login');
    }, 3000);
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
    <div className="mx-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-950">Reset Password</h1>
        <p className="mt-2 text-sm text-gray-600">
          Please enter your new password below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">New Password</span>
          <span className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-[var(--ahh-blue)] focus-within:ring-2 focus-within:ring-blue-100">
            <Lock className="h-4 w-4 text-gray-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border-0 bg-transparent text-sm outline-none"
              placeholder="Minimum 6 characters"
            />
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Confirm Password</span>
          <span className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-[var(--ahh-blue)] focus-within:ring-2 focus-within:ring-blue-100">
            <Lock className="h-4 w-4 text-gray-400" />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full border-0 bg-transparent text-sm outline-none"
              placeholder="Confirm Password"
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
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ahh-blue)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--ahh-blue-dark)] disabled:opacity-60 cursor-pointer"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Update Password
        </button>
      </form>
    </div>
  );
}
