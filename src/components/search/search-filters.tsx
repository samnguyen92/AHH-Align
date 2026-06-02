'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import Link from 'next/link';

const SPECIALTIES = [
  { value: 'All Specialties', count: null },
  { value: 'Family Medicine', count: 240 },
  { value: 'Dentistry', count: 185 },
  { value: 'Cardiology', count: 78 },
  { value: 'Pharmacy', count: 120 },
  { value: 'Ophthalmology', count: 92 },
  { value: 'Lab Testing', count: 56 },
  { value: 'Urgent Care', count: 45 },
  { value: 'Dermatology', count: 64 },
  { value: 'Pediatrics', count: 130 },
] as const;

const LANGUAGES = [
  { value: 'Vietnamese', count: 512 },
  { value: 'Korean', count: 321 },
  { value: 'Chinese (Mandarin)', count: 189 },
] as const;

const CITIES = [
  { value: 'Los Angeles', state: 'CA' },
  { value: 'Houston', state: 'TX' },
  { value: 'San Jose', state: 'CA' },
  { value: 'San Francisco', state: 'CA' },
  { value: 'Dallas', state: 'TX' },
  { value: 'Seattle', state: 'WA' },
  { value: 'Washington D.C.', state: 'MD' },
  { value: 'San Diego', state: 'CA' },
  { value: 'Atlanta', state: 'GA' },
  { value: 'Sacramento', state: 'CA' },
] as const;

export function SearchFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedSpecialty, setSelectedSpecialty] = useState(searchParams.get('specialty') ?? '');
  const [selectedLanguage, setSelectedLanguage] = useState(searchParams.get('language') ?? '');
  const [selectedCity, setSelectedCity] = useState(searchParams.get('city') ?? '');

  const applyFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.push(`/search?${params.toString()}`);
  }, [searchParams, router]);

  return (
    <aside className="brand-card w-full shrink-0 space-y-6 p-4 lg:w-64">
      {/* Filter by Specialty */}
      <div>
        <button className="mb-3 flex w-full items-center justify-between text-sm font-semibold text-[var(--ahh-ink)]">
          Filter by Specialty
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {SPECIALTIES.map((spec) => {
            const isAll = spec.value === 'All Specialties';
            const isSelected = isAll
              ? selectedSpecialty === ''
              : selectedSpecialty === spec.value;

            return (
              <label
                key={spec.value}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                  isSelected ? 'bg-[var(--ahh-deep-teal)] text-white' : 'text-[var(--ahh-muted)] hover:bg-[var(--ahh-mist)]'
                }`}
              >
                <input
                  type="radio"
                  name="specialty"
                  checked={isSelected}
                  onChange={() => {
                    const val = isAll ? '' : spec.value;
                    setSelectedSpecialty(val);
                    applyFilter('specialty', val);
                  }}
                  className="sr-only"
                />
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                  isSelected ? 'border-white bg-white' : 'border-[var(--ahh-border)]'
                }`}>
                  {isSelected && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-deep-teal)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </span>
                <span className="flex-1">{spec.value}</span>
                {spec.count != null && (
                  <span className={`text-xs ${isSelected ? 'text-white/70' : 'text-[var(--ahh-muted-2)]'}`}>
                    ({spec.count})
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Filter by Language */}
      <div>
        <button className="mb-3 flex w-full items-center justify-between text-sm font-semibold text-[var(--ahh-ink)]">
          Filter by Language
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div className="space-y-1.5">
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.value;
            return (
              <label
                key={lang.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm text-[var(--ahh-muted)] hover:bg-[var(--ahh-mist)] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {
                    const val = isSelected ? '' : lang.value;
                    setSelectedLanguage(val);
                    applyFilter('language', val);
                  }}
                  className="sr-only"
                />
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                  isSelected ? 'border-[var(--ahh-deep-teal)] bg-[var(--ahh-deep-teal)]' : 'border-[var(--ahh-border)]'
                }`}>
                  {isSelected && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </span>
                <span className="flex-1">{lang.value}</span>
                <span className="text-xs text-[var(--ahh-muted-2)]">({lang.count})</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Filter by City */}
      <div>
        <button className="mb-3 flex w-full items-center justify-between text-sm font-semibold text-[var(--ahh-ink)]">
          Filter by City
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {CITIES.map((c) => {
            const isSelected = selectedCity === c.value;
            return (
              <label
                key={c.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm text-[var(--ahh-muted)] hover:bg-[var(--ahh-mist)] transition-colors"
              >
                <input
                  type="radio"
                  name="city"
                  checked={isSelected}
                  onChange={() => {
                    const val = isSelected ? '' : c.value;
                    setSelectedCity(val);
                    applyFilter('city', val);
                  }}
                  className="sr-only"
                />
                <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                  isSelected ? 'border-[var(--ahh-deep-teal)] bg-[var(--ahh-deep-teal)]' : 'border-[var(--ahh-border)]'
                }`} />
                <span className="flex-1">{c.value}, {c.state}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Provider CTA */}
      <div className="rounded-[var(--ahh-radius)] bg-[var(--ahh-deep-teal)] p-4 text-center">
        <p className="text-sm font-bold text-white mb-1">Are You a Provider?</p>
        <p className="mb-3 text-xs text-white/72">
          Claim your free profile to show patients your language capabilities.
        </p>
        <Link
          href="/claim"
          className="brand-button min-h-9 px-4 py-2 text-xs"
        >
          Claim Your Profile →
        </Link>
      </div>
    </aside>
  );
}
