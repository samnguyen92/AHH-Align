'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Search,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Edit3,
  Languages,
  ImagePlus,
} from 'lucide-react';
import { ClaimRequestForm } from './claim-request-form';
import type { Clinic } from '@/types/database';

interface ClaimClinicLayoutProps {
  clinic: Clinic;
}

export function ClaimClinicLayout({ clinic }: ClaimClinicLayoutProps) {
  // Scroll helper
  const scrollToForm = () => {
    const el = document.getElementById('claim-form-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const clinicCity = clinic.city || 'Georgia';
  const clinicState = clinic.state || '';
  const locationText = [clinicCity, clinicState].filter(Boolean).join(', ') || 'USA';
  const clinicSpecialty = clinic.specialty || 'General Practice';
  const languagesList = clinic.languages && clinic.languages.length > 0 ? clinic.languages : ['English', 'Vietnamese'];

  return (
    <div className="bg-[#E5F0EB] px-[10px] pb-[10px] min-h-screen">
      <div className="home-shell space-y-6">

        {/* Hero Section */}
        <section className="overflow-hidden rounded-[16px] bg-[var(--ahh-deep-teal)] text-white">
          <div className="grid min-h-[580px] items-center gap-10 px-6 pb-16 pt-32 sm:px-10 lg:grid-cols-[minmax(0,1fr)_480px] lg:px-20 lg:pb-20 lg:pt-40">
            <div className="max-w-2xl">
              <p className="mb-5 inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/75">
                Provider Ownership
              </p>
              <h1 className="text-[36px] sm:text-[48px] lg:text-[54px] font-light leading-[1.1] tracking-normal">
                Claim {clinic.name}
              </h1>
              <p className="mt-6 max-w-xl text-sm sm:text-base leading-7 text-white/70">
                Verify ownership of your profile on Asian Health Hub to customize language support information, business hours, services, and attract more Vietnamese and Korean speaking patients.
              </p>

              {/* Checklist */}
              <div className="mt-8 flex flex-col sm:flex-row gap-4 sm:gap-6 text-sm font-semibold">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ahh-lime)] text-[var(--ahh-deep-teal)]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  <span>#1 Clinics in AHH lists</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ahh-lime)] text-[var(--ahh-deep-teal)]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  <span>No fees</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ahh-lime)] text-[var(--ahh-deep-teal)]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  <span>Targeted Patients</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={scrollToForm}
                  className="brand-button bg-[var(--ahh-lime)] text-[var(--ahh-deep-teal)] hover:bg-[var(--ahh-lime)]/90 cursor-pointer font-bold"
                >
                  Fill out Claim Form
                </button>
                <Link
                  href="/claim"
                  className="brand-button border border-white bg-transparent text-white hover:bg-white/10 cursor-pointer font-bold flex items-center justify-center"
                >
                  Go to Main Directory
                </Link>
              </div>
            </div>

            {/* Dynamic Clinic Card Mockup */}
            <div className="relative overflow-hidden rounded-[18px] bg-white/5 border border-white/10 p-6 flex flex-col justify-between shadow-2xl h-[340px] text-white">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold line-clamp-1">{clinic.name}</h3>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                  </div>
                  <p className="text-xs text-white/60 mt-1">{locationText}</p>
                </div>
                <span className="text-2xs bg-emerald-500/20 text-emerald-300 font-extrabold uppercase px-2 py-0.5 rounded-full border border-emerald-500/30 shrink-0">
                  Verified
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-white/80">
                  <span className="text-white/40">Specialty:</span>
                  <span className="font-semibold bg-white/10 px-2 py-0.5 rounded-md text-2xs">{clinicSpecialty}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/80">
                  <span className="text-white/40">Languages:</span>
                  {languagesList.map((lang, idx) => (
                    <span key={idx} className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md text-2xs font-bold font-sans">
                      {lang}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-white/80">
                  <span className="text-white/40">Rating:</span>
                  <div className="flex items-center text-amber-400 gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    ))}
                  </div>
                  <span className="font-bold text-white/90">4.9</span>
                  <span className="text-white/50 text-3xs">(84 reviews)</span>
                </div>
              </div>

              <div className="border-t border-white/10 pt-4 flex justify-between items-center text-2xs text-white/50">
                <span>Attracting patients 24/7</span>
                <span className="text-emerald-400 font-bold">AHH #1 List</span>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="home-section rounded-[16px] bg-white px-5 py-16 sm:px-10 lg:px-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold text-[var(--ahh-ink)]">How It Works</h2>
            <p className="mt-3 text-sm text-[var(--ahh-muted)]">
              Get your profile claimed and updated in 4 simple steps.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div className="rounded-[18px] bg-[var(--ahh-mist-2)] p-6 space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--ahh-blue)] shadow-3xs">
                <Search className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-[var(--ahh-ink)]">1. Find Your Clinic</h3>
              <p className="text-xs leading-6 text-[var(--ahh-muted)]">
                Search our directory to see if your clinic already exists. If not, you can submit a new one.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-[18px] bg-[var(--ahh-mist-2)] p-6 space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--ahh-blue)] shadow-3xs">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-[var(--ahh-ink)]">2. Submit ownership</h3>
              <p className="text-xs leading-6 text-[var(--ahh-muted)]">
                Fill out the simple claim form on this page, or click &quot;Claim Clinic&quot; on your profile page.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-[18px] bg-[var(--ahh-mist-2)] p-6 space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--ahh-blue)] shadow-3xs">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-[var(--ahh-ink)]">3. AHH Verifies</h3>
              <p className="text-xs leading-6 text-[var(--ahh-muted)]">
                Our team will review the request to verify you are authorized to manage this profile (takes 24-48 hours).
              </p>
            </div>

            {/* Step 4 */}
            <div className="rounded-[18px] bg-[var(--ahh-mist-2)] p-6 space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--ahh-blue)] shadow-3xs">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-[var(--ahh-ink)]">4. Access Granted</h3>
              <p className="text-xs leading-6 text-[var(--ahh-muted)]">
                Once verified, update language capabilities, specialties, reviews, and attract patients.
              </p>
            </div>
          </div>
        </section>

        {/* Claim New Clinics Section (Go back to Portal) */}
        <section className="scroll-mt-28 home-section grid gap-10 rounded-[16px] bg-[var(--ahh-mist-2)] px-5 py-16 sm:px-10 lg:grid-cols-[1fr_minmax(0,1.2fr)] lg:items-center lg:px-20">
          <div className="space-y-6">
            <h2 className="text-[28px] sm:text-[34px] font-bold leading-tight text-[var(--ahh-ink)]">
              Claim a Different Clinic Profile
            </h2>
            <p className="text-sm leading-7 text-[var(--ahh-muted)]">
              Do you manage more than one clinic or want to register a brand new clinic profile? Visit our main claiming directory to search other listings or suggest a new profile.
            </p>
            <Link href="/claim" className="brand-button-secondary inline-flex items-center gap-1.5 font-bold cursor-pointer">
              Claim / Submit New Clinics
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[16px] bg-white p-5 space-y-3 shadow-3xs border border-gray-100 flex flex-col justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Edit3 className="h-4.5 w-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[var(--ahh-ink)]">Edit Information</h4>
                <p className="text-[11px] leading-5 text-[var(--ahh-muted)] mt-1">Keep hours, phone, address, services, and profile information up to date.</p>
              </div>
            </div>

            <div className="rounded-[16px] bg-white p-5 space-y-3 shadow-3xs border border-gray-100 flex flex-col justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Languages className="h-4.5 w-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[var(--ahh-ink)]">Language support</h4>
                <p className="text-[11px] leading-5 text-[var(--ahh-muted)] mt-1">Specify language capabilities like Vietnamese or Korean for patient trust.</p>
              </div>
            </div>

            <div className="rounded-[16px] bg-white p-5 space-y-3 shadow-3xs border border-gray-100 flex flex-col justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <ImagePlus className="h-4.5 w-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[var(--ahh-ink)]">Photos & Logo</h4>
                <p className="text-[11px] leading-5 text-[var(--ahh-muted)] mt-1">Upload high quality photos of your facilities, doctors, and brand logo.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Claim Request Form */}
        <section id="claim-form-section" className="scroll-mt-28">
          <ClaimRequestForm clinic={clinic} />
        </section>

      </div>
    </div>
  );
}
