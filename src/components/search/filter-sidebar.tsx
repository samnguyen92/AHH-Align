'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SPECIALTIES = [
  'Family Medicine',
  'Internal Medicine',
  'Dentistry',
  'Pediatrics',
  'OB/GYN',
  'Ophthalmology',
  'Dermatology',
  'Cardiology',
  'Psychiatry',
  'Orthopedics',
] as const;

const LANGUAGES = [
  'Vietnamese',
  'Korean',
  'Chinese (Mandarin)',
  'Chinese (Cantonese)',
  'Japanese',
  'Tagalog',
  'Hindi',
  'Thai',
] as const;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
] as const;

export function FilterSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [city, setCity] = useState(searchParams.get('city') ?? '');
  const [state, setState] = useState(searchParams.get('state') ?? '');
  const [specialty, setSpecialty] = useState(searchParams.get('specialty') ?? '');
  const [language, setLanguage] = useState(searchParams.get('language') ?? '');

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (city.trim()) params.set('city', city.trim());
    if (state) params.set('state', state);
    if (specialty) params.set('specialty', specialty);
    if (language) params.set('language', language);
    router.push(`/search?${params.toString()}`);
  }, [city, state, specialty, language, router]);

  const clearFilters = useCallback(() => {
    setCity('');
    setState('');
    setSpecialty('');
    setLanguage('');
    router.push('/search');
  }, [router]);

  return (
    <aside className="w-full lg:w-72 shrink-0">
      <div className="sticky top-20 space-y-5 p-5 rounded-2xl border border-border/50 bg-card shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Filters
        </h2>

        {/* City */}
        <div className="space-y-1.5">
          <label htmlFor="filter-city" className="text-sm font-medium">City</label>
          <Input
            id="filter-city"
            placeholder="e.g. San Jose"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        {/* State */}
        <div className="space-y-1.5">
          <label htmlFor="filter-state" className="text-sm font-medium">State</label>
          <Select value={state} onValueChange={(v) => setState(v ?? '')}>
            <SelectTrigger id="filter-state">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Specialty */}
        <div className="space-y-1.5">
          <label htmlFor="filter-specialty" className="text-sm font-medium">Specialty</label>
          <Select value={specialty} onValueChange={(v) => setSpecialty(v ?? '')}>
            <SelectTrigger id="filter-specialty">
              <SelectValue placeholder="All specialties" />
            </SelectTrigger>
            <SelectContent>
              {SPECIALTIES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Language */}
        <div className="space-y-1.5">
          <label htmlFor="filter-language" className="text-sm font-medium">Language</label>
          <Select value={language} onValueChange={(v) => setLanguage(v ?? '')}>
            <SelectTrigger id="filter-language">
              <SelectValue placeholder="All languages" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            id="apply-filters-button"
            onClick={applyFilters}
            className="flex-1 bg-[var(--ahh-teal)] hover:bg-[var(--ahh-teal-dark)] text-white"
          >
            Apply
          </Button>
          <Button
            id="clear-filters-button"
            variant="outline"
            onClick={clearFilters}
            className="flex-1"
          >
            Clear
          </Button>
        </div>
      </div>
    </aside>
  );
}
