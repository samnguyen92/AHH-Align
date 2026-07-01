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
      setUser(data.session?.session?.user ?? null);
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
      <div className="flex h-48 items-center justify-center rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--ahh-blue)]" />
      </div>
    );
  }

  if (claimId) {
    return (
      <div className="rounded-[16px] border border-emerald-100 bg-white p-6 sm:p-10 lg:p-12 shadow-3xs text-center space-y-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mx-auto">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-[var(--ahh-ink)]">Claim Submitted Successfully!</h2>
          <p className="text-sm text-[var(--ahh-muted)] leading-relaxed">
            Your request for <span className="font-semibold text-[var(--ahh-ink)]">{clinic.name}</span> is pending review. Our team will verify ownership and update status within 24-48 hours.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href={`/api/claim/status/${claimId}`}
            className="brand-button-secondary font-bold"
          >
            Check Status
          </Link>
          <Link
            href="/dashboard"
            className="brand-button font-bold bg-[var(--ahh-deep-teal)] text-white hover:bg-[var(--ahh-deep-teal)]/90"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[16px] bg-white p-6 sm:p-10 lg:p-12 border border-[var(--ahh-border)] shadow-3xs space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--ahh-deep-teal)]">
          Claim request
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--ahh-ink)]">{clinic.name}</h1>
        <p className="mt-2 text-xs text-[var(--ahh-muted)] leading-relaxed">
          Verify that you own or manage this clinic profile. Approved owners will be able to update profile details in a later dashboard release.
        </p>
      </div>

      <div className="space-y-4">
        {!isAuthenticated && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-[var(--ahh-ink)] block">
                Full name *
              </label>
              <input
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                placeholder="Your full name"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-[var(--ahh-ink)] block">
                Role at Clinic *
              </label>
              <input
                required
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                placeholder="Owner, Manager, Doctor, etc."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--ahh-ink)] block">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--ahh-ink)] block">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                placeholder="(555) 000-0000"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[var(--ahh-ink)] block">
            Verification Method *
          </label>
          <select
            value={proofType}
            onChange={(event) => setProofType(event.target.value)}
            className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
          >
            <option value="npi_verification">NPI verification</option>
            <option value="phone_verification">Phone verification</option>
            <option value="document">Business document</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[var(--ahh-ink)] block">
            Proof Detail *
          </label>
          <input
            required
            value={proofValue}
            onChange={(event) => setProofValue(event.target.value)}
            className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
            placeholder="NPI number, callback phone, or document reference"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[var(--ahh-ink)] block">
            Additional notes
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
            placeholder="Tell us your role at the clinic and the best way to verify ownership."
          />
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive flex items-center gap-2">
          <span>{message}</span>
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="brand-button-secondary px-8 font-bold flex items-center justify-center shrink-0 min-h-10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Submit claim request
        </button>
      </div>
    </form>
  );
}
