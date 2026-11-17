'use client';

import { FormEvent, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/services/supabase-client';
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
    <form onSubmit={handleSubmit} className="rounded-xl bg-white p-5 ring-1 ring-[#0D1F1C]/10 md:rounded-2xl md:p-7">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-[#0D1F1C]">Account settings</h2>
        <p className="mt-1 text-sm text-[#0D1F1C]/70">
          Update your provider username and password.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label>
          <span className="text-sm font-bold">Username</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
            placeholder="Clinic owner or manager"
          />
        </label>

        <label>
          <span className="text-sm font-bold">Email</span>
          <input
            value={email}
            disabled
            className="mt-2 h-12 w-full rounded-full bg-stone-100 px-5 text-base font-medium opacity-60"
          />
        </label>

        <label className="md:col-span-2">
          <span className="text-sm font-bold">New password</span>
          <input
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
            placeholder="Leave blank to keep current password"
          />
        </label>
      </div>

      {message && (
        <p className="mt-4 rounded-xl bg-[#E3F1EC] px-4 py-3 text-sm font-semibold text-[#024E44]" role="status">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#024E44] px-6 text-sm font-bold text-white btn-fx disabled:opacity-60"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save account
      </button>
    </form>
  );
}
