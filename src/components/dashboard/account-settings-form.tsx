'use client';

import { FormEvent, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { persistAuthToken } from '@/lib/auth/session-cookie';

interface AccountSettingsFormProps {
  initialName: string;
  email: string;
}

export function AccountSettingsForm({ initialName, email }: AccountSettingsFormProps) {
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const updates: Parameters<typeof supabase.auth.updateUser>[0] = {
      data: { name },
    };

    if (password.trim()) {
      if (password.length < 8) {
        setMessage('Password must be at least 8 characters.');
        setIsLoading(false);
        return;
      }
      updates.password = password;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      persistAuthToken(sessionData.session.access_token);
    }

    const { error } = await supabase.auth.updateUser(updates);
    setIsLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPassword('');
    setMessage('Account settings saved.');
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-950">Account settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Update your provider username and password.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="text-sm font-medium text-gray-700">Username</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100"
            placeholder="Clinic owner or manager"
          />
        </label>

        <label>
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            value={email}
            disabled
            className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500"
          />
        </label>

        <label className="md:col-span-2">
          <span className="text-sm font-medium text-gray-700">New password</span>
          <input
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100"
            placeholder="Leave blank to keep current password"
          />
        </label>
      </div>

      {message && (
        <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--ahh-blue)] px-4 text-sm font-semibold text-white hover:bg-[var(--ahh-blue-dark)] disabled:opacity-60"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save account
      </button>
    </form>
  );
}
