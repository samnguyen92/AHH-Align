'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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

const CITIES = [
  'San Jose',
  'Houston',
  'Los Angeles',
  'New York',
  'Seattle',
  'Chicago',
  'San Francisco',
  'Dallas',
  'Washington D.C.',
  'Atlanta',
] as const;

export function HeroSearch() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [city, setCity] = useState('');
  const [language, setLanguage] = useState('');

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('query', keyword.trim());
    if (specialty) params.set('specialty', specialty);
    if (city) params.set('city', city);
    if (language) params.set('language', language);
    router.push(`/search?${params.toString()}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  return (
    <div className="brand-card w-full rounded-lg p-2 animate-slide-up">
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        {/* Keyword Input */}
        <div className="flex-[2] relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-deep-teal)" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            id="hero-keyword-input"
            type="text"
            placeholder="Search by specialty, clinic name, or keyword..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-10 w-full rounded-lg border-0 bg-transparent pl-9 pr-3 text-sm text-[var(--ahh-ink)] outline-none placeholder:text-[var(--ahh-muted)]"
          />
        </div>

        {/* Dividers + Selects */}
        <div className="my-1 hidden w-px self-stretch bg-[var(--ahh-border)] sm:block" />

        <Select value={specialty} onValueChange={(v) => setSpecialty(v ?? '')}>
          <SelectTrigger id="hero-specialty" className="flex-1 h-10 border-0 bg-transparent text-sm focus:ring-0">
            <SelectValue placeholder="Specialty" />
          </SelectTrigger>
          <SelectContent>
            {SPECIALTIES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="my-1 hidden w-px self-stretch bg-[var(--ahh-border)] sm:block" />

        <Select value={city} onValueChange={(v) => setCity(v ?? '')}>
          <SelectTrigger id="hero-city" className="flex-1 h-10 border-0 bg-transparent text-sm focus:ring-0">
            <SelectValue placeholder="City" />
          </SelectTrigger>
          <SelectContent>
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="my-1 hidden w-px self-stretch bg-[var(--ahh-border)] sm:block" />

        <Select value={language} onValueChange={(v) => setLanguage(v ?? '')}>
          <SelectTrigger id="hero-language" className="flex-1 h-10 border-0 bg-transparent text-sm focus:ring-0">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search Button */}
        <button
          type="button"
          id="hero-search-button"
          onClick={handleSearch}
          className="brand-button h-10 px-6 text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Search
        </button>
      </div>
    </div>
  );
}
