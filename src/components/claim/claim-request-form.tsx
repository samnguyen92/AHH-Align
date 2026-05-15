'use client';

import { FormEvent, useState } from 'react';
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      router.push(`/auth/login?next=/claim/${clinic.id}`);
      return;
    }

    persistAuthToken(token);

    const response = await fetch('/api/claim', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clinic_id: clinic.id,
        proof_type: proofType,
        proof_data: {
          value: proofValue,
          clinic_name: clinic.name,
          clinic_phone: clinic.phone,
        },
        notes,
      }),
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

  if (claimId) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
        <h2 className="mt-4 text-xl font-bold text-green-950">Claim submitted</h2>
        <p className="mt-2 text-sm text-green-800">
          Your request for {clinic.name} is pending review.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/api/claim/status/${claimId}`}
            className="rounded-lg border border-green-300 px-4 py-2 text-sm font-semibold text-green-900 hover:bg-green-100"
          >
            Check status
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-[var(--ahh-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--ahh-blue-dark)]"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ahh-blue)]">
          Claim request
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-950">{clinic.name}</h1>
        <p className="mt-2 text-sm text-gray-600">
          Verify that you own or manage this clinic profile. Approved owners will be able to update profile details in a later dashboard release.
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Verification method</span>
          <select
            value={proofType}
            onChange={(event) => setProofType(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100"
          >
            <option value="npi_verification">NPI verification</option>
            <option value="phone_verification">Phone verification</option>
            <option value="document">Business document</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Proof detail</span>
          <input
            required
            value={proofValue}
            onChange={(event) => setProofValue(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100"
            placeholder="NPI number, callback phone, or document reference"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Additional notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100"
            placeholder="Tell us your role at the clinic and the best way to verify ownership."
          />
        </label>
      </div>

      {message && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ahh-blue)] px-4 text-sm font-semibold text-white hover:bg-[var(--ahh-blue-dark)] disabled:opacity-60"
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit claim request
      </button>
    </form>
  );
}
