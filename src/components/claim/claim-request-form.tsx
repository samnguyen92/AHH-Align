'use client';

import { FormEvent, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/services/supabase-client';
import { persistAuthToken } from '@/lib/auth/session-cookie';
import type { Clinic } from '@/types/database';

interface ClaimRequestFormProps {
  clinic: Clinic;
}

export function ClaimRequestForm({ clinic }: ClaimRequestFormProps) {
  const router = useRouter();
  const [proofType, setProofType] = useState('npi_verification');
  const [proofValue, setProofValue] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
      setUser((data.session as { user?: { id: string; email?: string } } | null)?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (token) {
      persistAuthToken(token);
    }

    const payload: any = {
      clinic_id: clinic.id,
      proof_type: proofType,
      proof_data: {
        value: proofValue,
        clinic_name: clinic.name,
        clinic_phone: clinic.phone,
      },
      notes,
    };

    if (token && user) {
      payload.proof_data.full_name = user.user_metadata?.full_name || 'Authenticated User';
      payload.proof_data.email = user.email;
      payload.proof_data.phone = user.phone || '';
      payload.proof_data.role = 'Authenticated Owner';
    } else {
      payload.proof_data.full_name = fullName.trim();
      payload.proof_data.email = email.trim().toLowerCase();
      payload.proof_data.phone = phone.trim();
      payload.proof_data.role = role.trim();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api/claim', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setIsLoading(false);

    if (!response.ok) {
      setMessage(result.error ?? 'Unable to submit claim request.');
      return;
    }

    setClaimId(result.claim_request.id);
    setMessage('Claim request submitted. We will review the details soon.');
  }

  if (isAuthenticated === null) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl bg-stone-50 p-6 md:rounded-2xl">
        <Loader2 className="h-6 w-6 animate-spin text-[#024E44]" aria-label="Loading" />
      </div>
    );
  }

  if (claimId) {
    return (
      <div className="space-y-6 rounded-xl bg-[#E3F1EC] p-6 text-center sm:p-10 md:rounded-2xl lg:p-12" role="status">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#024E44]">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Claim submitted</h2>
          <p className="text-sm font-medium leading-relaxed opacity-75">
            Your request for <span className="font-bold">{clinic.name}</span> is pending review. Our team will verify ownership and update status within 24-48 hours.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href={`/api/claim/status/${claimId}`}
            className="inline-flex min-h-12 items-center rounded-full border border-[#0D1F1C] px-6 text-sm font-bold btn-fx btn-fx--green"
          >
            Check status
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-12 items-center rounded-full bg-[#024E44] px-6 text-sm font-bold text-white btn-fx"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl bg-white p-5 ring-1 ring-[#0D1F1C]/10 md:rounded-2xl md:p-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest opacity-55">
          Claim request
        </p>
        <h2 className="mt-2 text-2xl font-bold md:text-3xl">{clinic.name}</h2>
        <p className="mt-2 text-sm font-medium leading-relaxed opacity-70">
          Verify that you own or manage this clinic profile. Approved owners will be able to update profile details in a later dashboard release.
        </p>
      </div>

      <div className="space-y-4">
        {!isAuthenticated && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-sm font-bold">
                Full name *
              </label>
              <input
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
                placeholder="Your full name"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-sm font-bold">
                Role at Clinic *
              </label>
              <input
                required
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
                placeholder="Owner, Manager, Doctor, etc."
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
                placeholder="(555) 000-0000"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-bold">
            Verification Method *
          </label>
          <select
            value={proofType}
            onChange={(event) => setProofType(event.target.value)}
            className="h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
          >
            <option value="npi_verification">NPI verification</option>
            <option value="phone_verification">Phone verification</option>
            <option value="document">Business document</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-bold">
            Proof Detail *
          </label>
          <input
            required
            value={proofValue}
            onChange={(event) => setProofValue(event.target.value)}
            className="h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
            placeholder="NPI number, callback phone, or document reference"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-bold">
            Additional notes
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            className="w-full resize-y rounded-2xl bg-stone-50 px-5 py-3 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]"
            placeholder="Tell us your role at the clinic and the best way to verify ownership."
          />
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">
          <span>{message}</span>
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="flex min-h-12 shrink-0 items-center justify-center rounded-full bg-[#024E44] px-7 text-sm font-bold text-white btn-fx disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Submit claim request
        </button>
      </div>
    </form>
  );
}
