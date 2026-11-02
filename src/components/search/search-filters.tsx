'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { FilterOption, CityFilterOption } from '@/services/clinic-service';

interface SearchFiltersProps {
  specialties: FilterOption[];
  languages: FilterOption[];
  cities: CityFilterOption[];
}

function parseCityParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

export function SearchFilters({
  specialties,
  languages,
  cities,
}: SearchFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedSpecialty, setSelectedSpecialty] = useState(searchParams.get('specialty') ?? '');
  const [selectedLanguage, setSelectedLanguage] = useState(searchParams.get('language') ?? '');
  const [selectedCities, setSelectedCities] = useState<string[]>(() =>
    parseCityParam(searchParams.get('city'))
  );
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    setSelectedSpecialty(searchParams.get('specialty') ?? '');
    setSelectedLanguage(searchParams.get('language') ?? '');
    setSelectedCities(parseCityParam(searchParams.get('city')));
  }, [searchParams]);

  const applyFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      router.push(`/search?${params.toString()}`);
    },
    [searchParams, router]
  );

  const toggleCity = useCallback(
    (cityName: string) => {
      const exists = selectedCities.includes(cityName);
      const next = exists
        ? selectedCities.filter((c) => c !== cityName)
        : [...selectedCities, cityName];
      setSelectedCities(next);
      applyFilter('city', next.join(','));
    },
    [selectedCities, applyFilter]
  );

  const clearCities = useCallback(() => {
    setSelectedCities([]);
    applyFilter('city', '');
  }, [applyFilter]);

  const specialtiesList = [
    { value: 'All Specialties', count: null },
    ...specialties,
  ];

  return (
    <div>
      {/* Mobile Toggle Button */}
      <button
        type="button"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="flex w-full items-center justify-between rounded-2xl border border-[#024E44]/15 bg-white px-4 py-3.5 text-sm font-semibold text-[#0D1F1C] lg:hidden cursor-pointer mb-4"
      >
        <span className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#024E44" strokeWidth="2.2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filter Directory
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          className={`transition-transform duration-200 ${isMobileOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <aside className={`lg-filter-panel ${isMobileOpen ? 'flex' : 'hidden lg:flex'}`}>
        {/* Filter by Language */}
        {languages.length > 0 && (
          <div className="lg-filter-group">
            <div className="lg-filter-head">
              <h3>Language Spoken</h3>
              {selectedLanguage && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLanguage('');
                    applyFilter('language', '');
                  }}
                  className="lg-filter-reset"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="lg-filter-list">
              {languages.map((lang) => {
                const isSelected = selectedLanguage === lang.value;
                return (
                  <label
                    key={lang.value}
                    className={`lg-filter-item ${isSelected ? 'is-selected' : ''}`}
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
                    <span className="lg-filter-box">
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{lang.value}</span>
                    <span className="cnt">{lang.count}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter by Specialty */}
        {specialties.length > 0 && (
          <div className="lg-filter-group" id="specialty-filter">
            <div className="lg-filter-head">
              <h3>Clinical Specialty</h3>
              {selectedSpecialty && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSpecialty('');
                    applyFilter('specialty', '');
                  }}
                  className="lg-filter-reset"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="lg-filter-list">
              {specialtiesList.map((spec) => {
                const isAll = spec.value === 'All Specialties';
                const isSelected = isAll ? selectedSpecialty === '' : selectedSpecialty === spec.value;
                return (
                  <label
                    key={spec.value}
                    className={`lg-filter-item ${isSelected ? 'is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        if (isAll) {
                          setSelectedSpecialty('');
                          applyFilter('specialty', '');
                        } else {
                          const val = isSelected ? '' : spec.value;
                          setSelectedSpecialty(val);
                          applyFilter('specialty', val);
                        }
                      }}
                      className="sr-only"
                    />
                    <span className="lg-filter-box">
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{spec.value}</span>
                    {spec.count != null && <span className="cnt">{spec.count}</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter by City (Multi-select + Toggle Off) */}
        {cities.length > 0 && (
          <div className="lg-filter-group" id="city-filter">
            <div className="lg-filter-head">
              <h3>City &amp; Metro</h3>
              {selectedCities.length > 0 && (
                <button
                  type="button"
                  onClick={clearCities}
                  className="lg-filter-reset"
                >
                  Clear ({selectedCities.length})
                </button>
              )}
            </div>
            <div className="lg-filter-list">
              {/* All Cities Option */}
              <label
                className={`lg-filter-item ${selectedCities.length === 0 ? 'is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedCities.length === 0}
                  onChange={clearCities}
                  className="sr-only"
                />
                <span className="lg-filter-box">
                  {selectedCities.length === 0 && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="truncate">All Cities</span>
              </label>

              {cities.map((c) => {
                const isSelected = selectedCities.includes(c.value);
                return (
                  <label
                    key={c.value}
                    className={`lg-filter-item ${isSelected ? 'is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCity(c.value)}
                      className="sr-only"
                    />
                    <span className="lg-filter-box">
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">
                      {c.value}, {c.state}
                    </span>
                    <span className="cnt">{c.count}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Clinic Owner Callout */}
        <div className="lg-filter-cta">
          <h4>Run an Asian-friendly clinic?</h4>
          <p>
            Claim your verified profile to update bilingual hours, insurance networks, and care specialties.
          </p>
          <Link href="/claim">
            <span>Claim Free Profile</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </aside>
    </div>
  );
}
