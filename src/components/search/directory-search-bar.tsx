'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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

    params.delete('page');
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
    <div className="lg-dir-searchbox">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
        {/* Keyword Search */}
        <div className="flex-[2] relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#024E44"
            strokeWidth="2.2"
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search by clinic name, doctor, symptom, or keyword..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-11 pl-10 pr-3 text-[14.5px] font-medium text-[#0D1F1C] placeholder:text-[#5A7A70] bg-transparent border-0 outline-none"
          />
        </div>

        <div className="my-1.5 hidden w-px self-stretch bg-[#024E44]/12 lg:block" />

        {/* Specialty Dropdown */}
        <Select
          value={specialty || 'all-specialties'}
          onValueChange={(val) => {
            const finalVal = val === 'all-specialties' ? '' : (val || '');
            setSpecialty(finalVal);
            applyFilters(keyword, finalVal, city, language);
          }}
        >
          <SelectTrigger className="flex-1 h-11 border-0 bg-transparent px-3 text-[14px] font-medium focus:ring-0 text-[#0D1F1C] flex items-center justify-between">
            <span className="flex flex-1 text-left truncate">
              {specialty ? specialty : 'All Specialties'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-specialties">All Specialties</SelectItem>
            {SPECIALTIES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="my-1.5 hidden w-px self-stretch bg-[#024E44]/12 lg:block" />

        {/* City Dropdown */}
        <Select
          value={city.includes(',') ? 'multi-city' : city || 'all-cities'}
          onValueChange={(val) => {
            if (val === 'multi-city') return;
            const finalVal = val === 'all-cities' ? '' : (val || '');
            setCity(finalVal);
            applyFilters(keyword, specialty, finalVal, language);
          }}
        >
          <SelectTrigger className="flex-1 h-11 border-0 bg-transparent px-3 text-[14px] font-medium focus:ring-0 text-[#0D1F1C] flex items-center justify-between">
            <span className="flex flex-1 text-left truncate">
              {city
                ? city.includes(',')
                  ? `${city.split(',').length} Cities (${city.replace(/,/g, ', ')})`
                  : city
                : 'All Cities'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-cities">All Cities (Clear)</SelectItem>
            {city.includes(',') && (
              <SelectItem value="multi-city">
                Selected: {city.replace(/,/g, ', ')}
              </SelectItem>
            )}
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="my-1.5 hidden w-px self-stretch bg-[#024E44]/12 lg:block" />

        {/* Language Dropdown */}
        <Select
          value={language || 'all-languages'}
          onValueChange={(val) => {
            const finalVal = val === 'all-languages' ? '' : (val || '');
            setLanguage(finalVal);
            applyFilters(keyword, specialty, city, finalVal);
          }}
        >
          <SelectTrigger className="flex-1 h-11 border-0 bg-transparent px-3 text-[14px] font-medium focus:ring-0 text-[#0D1F1C] flex items-center justify-between">
            <span className="flex flex-1 text-left truncate">
              {language ? language : 'All Languages'}
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
          className="lg-cta lg-cta--lime shrink-0 justify-center h-11 px-6"
          style={{ borderRadius: 14 }}
        >
          <span>Search Directory</span>
          <span className="arr" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
