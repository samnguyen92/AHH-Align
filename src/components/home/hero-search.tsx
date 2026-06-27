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
  'Primary Care',
  'Dental',
  'Mental Health',
  'OB/GYN',
  'Ophthalmology',
  'Cardiology',
  'Dermatology',
  'Orthopedics',
  'Pediatrics',
] as const;

const LANGUAGES = [
  'Vietnamese',
  'Korean',
  'Chinese',
] as const;

const CITIES = [
  'Los Angeles',
  'Houston',
  'San Jose',
  'Dallas',
  'San Francisco',
  'Seattle',
  'Washington',
  'San Diego',
  'Atlanta',
  'Sacramento',
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
    if (specialty && specialty !== 'all-specialties') params.set('specialty', specialty);
    if (city && city !== 'all-cities') params.set('city', city);
    if (language && language !== 'all-languages') params.set('language', language);
    router.push(`/search?${params.toString()}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  return (
    <div className="brand-card w-full rounded-lg p-2 animate-slide-up bg-white shadow-[0_18px_50px_rgba(2,78,68,0.08)]">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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
            className="h-10 w-full rounded-lg border-0 bg-transparent pl-9 pr-3 text-sm text-[var(--ahh-ink)] outline-none placeholder:text-[var(--ahh-muted-2)]"
          />
        </div>

        {/* Dividers + Selects */}
        <div className="my-1 hidden w-px self-stretch bg-[var(--ahh-border)] sm:block" />

        <Select
          value={specialty || 'all-specialties'}
          onValueChange={(v) => {
            const finalVal = v === 'all-specialties' ? '' : (v ?? '');
            setSpecialty(finalVal);
          }}
        >
          <SelectTrigger id="hero-specialty" className="flex-1 h-10 border-0 bg-transparent text-sm focus:ring-0 text-[var(--ahh-ink)] placeholder:text-[var(--ahh-muted-2)] flex items-center justify-between">
            <span className="flex flex-1 text-left">
              {specialty ? specialty : "All Specialties"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-specialties">All Specialties</SelectItem>
            {SPECIALTIES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="my-1 hidden w-px self-stretch bg-[var(--ahh-border)] sm:block" />

        <Select
          value={city || 'all-cities'}
          onValueChange={(v) => {
            const finalVal = v === 'all-cities' ? '' : (v ?? '');
            setCity(finalVal);
          }}
        >
          <SelectTrigger id="hero-city" className="flex-1 h-10 border-0 bg-transparent text-sm focus:ring-0 text-[var(--ahh-ink)] placeholder:text-[var(--ahh-muted-2)] flex items-center justify-between">
            <span className="flex flex-1 text-left">
              {city ? city : "All Cities"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-cities">All Cities</SelectItem>
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="my-1 hidden w-px self-stretch bg-[var(--ahh-border)] sm:block" />

        <Select
          value={language || 'all-languages'}
          onValueChange={(v) => {
            const finalVal = v === 'all-languages' ? '' : (v ?? '');
            setLanguage(finalVal);
          }}
        >
          <SelectTrigger id="hero-language" className="flex-1 h-10 border-0 bg-transparent text-sm focus:ring-0 text-[var(--ahh-ink)] placeholder:text-[var(--ahh-muted-2)] flex items-center justify-between">
            <span className="flex flex-1 text-left">
              {language ? language : "All Languages"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-languages">All Languages</SelectItem>
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
          className="brand-button-secondary h-10 px-6 text-sm flex items-center justify-center shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Search
        </button>
      </div>
    </div>
  );
}
