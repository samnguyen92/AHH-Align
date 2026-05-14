'use client';

import { FormEvent, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { persistAuthToken } from '@/lib/auth/session-cookie';
import type { Clinic } from '@/types/database';

interface ClinicEditFormProps {
  clinic: Clinic;
}

function listToString(value: string[] | undefined) {
  return (value ?? []).join(', ');
}

function stringToList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ClinicEditForm({ clinic }: ClinicEditFormProps) {
  const [name, setName] = useState(clinic.name);
  const [description, setDescription] = useState(clinic.description ?? '');
  const [address, setAddress] = useState(clinic.address ?? '');
  const [city, setCity] = useState(clinic.city ?? '');
  const [state, setState] = useState(clinic.state ?? '');
  const [zipCode, setZipCode] = useState(clinic.zip_code ?? '');
  const [phone, setPhone] = useState(clinic.phone ?? '');
  const [specialty, setSpecialty] = useState(clinic.specialty ?? '');
  const [languages, setLanguages] = useState(listToString(clinic.languages));
  const [services, setServices] = useState(listToString(clinic.metadata?.services));
  const [insurance, setInsurance] = useState(
    listToString(clinic.metadata?.insurance_accepted)
  );
  const [isTelehealth, setIsTelehealth] = useState(clinic.is_telehealth_available);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage('Please sign in again before saving.');
      setIsLoading(false);
      return;
    }

    persistAuthToken(token);

    const response = await fetch('/api/dashboard/clinic', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clinic_id: clinic.id,
        name,
        description,
        address,
        city,
        state,
        zip_code: zipCode,
        phone,
        specialty,
        languages: stringToList(languages),
        is_telehealth_available: isTelehealth,
        metadata: {
          services: stringToList(services),
          insurance_accepted: stringToList(insurance),
        },
      }),
    });

    const result = await response.json();
    setIsLoading(false);

    if (!response.ok) {
      setMessage(result.error ?? 'Unable to save clinic profile.');
      return;
    }

    setMessage('Profile saved.');
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="text-sm font-medium text-gray-700">Clinic name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" />
        </label>

        <label className="md:col-span-2">
          <span className="text-sm font-medium text-gray-700">Description</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" />
        </label>

        <label className="md:col-span-2">
          <span className="text-sm font-medium text-gray-700">Address</span>
          <input value={address} onChange={(event) => setAddress(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" />
        </label>

        <label>
          <span className="text-sm font-medium text-gray-700">City</span>
          <input value={city} onChange={(event) => setCity(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" />
        </label>

        <label>
          <span className="text-sm font-medium text-gray-700">State</span>
          <input value={state} onChange={(event) => setState(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm uppercase outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" maxLength={2} />
        </label>

        <label>
          <span className="text-sm font-medium text-gray-700">ZIP code</span>
          <input value={zipCode} onChange={(event) => setZipCode(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" />
        </label>

        <label>
          <span className="text-sm font-medium text-gray-700">Phone</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" />
        </label>

        <label>
          <span className="text-sm font-medium text-gray-700">Specialty</span>
          <input value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" />
        </label>

        <label>
          <span className="text-sm font-medium text-gray-700">Languages</span>
          <input value={languages} onChange={(event) => setLanguages(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" placeholder="Vietnamese, English" />
        </label>

        <label className="md:col-span-2">
          <span className="text-sm font-medium text-gray-700">Services</span>
          <input value={services} onChange={(event) => setServices(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" placeholder="Primary care, Pediatrics, Dental" />
        </label>

        <label className="md:col-span-2">
          <span className="text-sm font-medium text-gray-700">Insurance accepted</span>
          <input value={insurance} onChange={(event) => setInsurance(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[var(--ahh-blue)] focus:ring-2 focus:ring-blue-100" placeholder="Medicare, Medi-Cal, Private insurance" />
        </label>
      </div>

      <label className="mt-5 flex items-center gap-2 text-sm font-medium text-gray-700">
        <input type="checkbox" checked={isTelehealth} onChange={(event) => setIsTelehealth(event.target.checked)} className="h-4 w-4 rounded border-gray-300" />
        Telehealth available
      </label>

      {message && (
        <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {message}
        </p>
      )}

      <button type="submit" disabled={isLoading} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--ahh-blue)] px-4 text-sm font-semibold text-white hover:bg-[var(--ahh-blue-dark)] disabled:opacity-60">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save profile
      </button>
    </form>
  );
}
