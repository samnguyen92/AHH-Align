'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
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

export function DirectorySearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState(searchParams.get('query') ?? '');
  const [specialty, setSpecialty] = useState(searchParams.get('specialty') ?? '');
  const [city, setCity] = useState(searchParams.get('city') ?? '');
  const [language, setLanguage] = useState(searchParams.get('language') ?? '');

  // Bidirectional sync: Update local states when URL changes (e.g. via Sidebar Filters)
  useEffect(() => {
    setKeyword(searchParams.get('query') ?? '');
    setSpecialty(searchParams.get('specialty') ?? '');
    setCity(searchParams.get('city') ?? '');
    setLanguage(searchParams.get('language') ?? '');
  }, [searchParams]);

  function applyFilters(newKeyword = keyword, newSpecialty = specialty, newCity = city, newLanguage = language) {
    const params = new URLSearchParams(searchParams.toString());

    if (newKeyword.trim()) {
      params.set('query', newKeyword.trim());
    } else {
      params.delete('query');
    }

    if (newSpecialty && newSpecialty !== 'all-specialties') {
      params.set('specialty', newSpecialty);
    } else {
      params.delete('specialty');
    }

    if (newCity && newCity !== 'all-cities') {
      params.set('city', newCity);
    } else {
      params.delete('city');
    }

    if (newLanguage && newLanguage !== 'all-languages') {
      params.set('language', newLanguage);
    } else {
      params.delete('language');
    }

    params.delete('page'); // Reset pagination
    router.push(`/search?${params.toString()}`);
  }

  function handleSearchClick() {
    applyFilters();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      applyFilters();
    }
  }

  return (
    <div className="brand-input-shell mx-auto max-w-[1360px] p-2 bg-white shadow-[0_18px_50px_rgba(2,78,68,0.06)] rounded-lg">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Keyword Search */}
        <div className="flex-[2] relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-deep-teal)" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            placeholder="Search by specialty, clinic name, or keyword..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-10 pl-9 pr-3 text-sm text-[var(--ahh-ink)] placeholder:text-[var(--ahh-muted-2)] bg-transparent border-0 outline-none"
          />
        </div>

        {/* Dividers & Select Dropdowns */}
        <div className="my-1 hidden w-px self-stretch bg-gray-200 sm:block" />

        <Select
          value={specialty || 'all-specialties'}
          onValueChange={(val) => {
            const finalVal = val === 'all-specialties' ? '' : (val || '');
            setSpecialty(finalVal);
            applyFilters(keyword, finalVal, city, language);
          }}
        >
          <SelectTrigger className="flex-1 h-10 border-0 bg-transparent text-sm focus:ring-0 text-[var(--ahh-ink)] placeholder:text-[var(--ahh-muted-2)] flex items-center justify-between">
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

        <div className="my-1 hidden w-px self-stretch bg-gray-200 sm:block" />

        <Select
          value={city || 'all-cities'}
          onValueChange={(val) => {
            const finalVal = val === 'all-cities' ? '' : (val || '');
            setCity(finalVal);
            applyFilters(keyword, specialty, finalVal, language);
          }}
        >
          <SelectTrigger className="flex-1 h-10 border-0 bg-transparent text-sm focus:ring-0 text-[var(--ahh-ink)] placeholder:text-[var(--ahh-muted-2)] flex items-center justify-between">
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

        <div className="my-1 hidden w-px self-stretch bg-gray-200 sm:block" />

        <Select
          value={language || 'all-languages'}
          onValueChange={(val) => {
            const finalVal = val === 'all-languages' ? '' : (val || '');
            setLanguage(finalVal);
            applyFilters(keyword, specialty, city, finalVal);
          }}
        >
          <SelectTrigger className="flex-1 h-10 border-0 bg-transparent text-sm focus:ring-0 text-[var(--ahh-ink)] placeholder:text-[var(--ahh-muted-2)] flex items-center justify-between">
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

        {/* Action Button */}
        <button
          type="button"
          onClick={handleSearchClick}
          className="brand-button-secondary h-10 px-6 text-sm flex items-center justify-center shrink-0 rounded-md"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Search
        </button>
      </div>
    </div>
  );
}
