"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Search,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Edit3,
  Languages,
  ImagePlus,
  Info,
} from 'lucide-react';

export default function ClaimLandingPage() {
  const router = useRouter();

  // Scroll Helpers
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Form State
  const [clinicName, setClinicName] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [updates, setUpdates] = useState({
    profileInfo: false,
    hoursLocation: false,
    languageSupport: false,
    specialtiesServices: false,
    other: false,
    missingClinic: false,
  });
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  // Footer Search State
  const [footerKeyword, setFooterKeyword] = useState('');
  const [footerLanguage, setFooterLanguage] = useState('');

  const handleCheckboxChange = (key: keyof typeof updates) => {
    setUpdates((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setError('You must confirm you are authorized to manage the profile.');
      return;
    }
    if (!clinicName || !fullName || !role || !email || !phone) {
      setError('Please fill out all required fields.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Simulate API submit request
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setIsSuccess(true);
    } catch (err) {
      setError('Failed to submit ownership request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFooterSearch = () => {
    const params = new URLSearchParams();
    if (footerKeyword) params.set('q', footerKeyword);
    if (footerLanguage) params.set('language', footerLanguage);
    router.push(`/search?${params.toString()}`);
  };

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
                Reach Vietnamese & Korean Patients – Claim Your Free Clinic Profile
              </h1>
              <p className="mt-6 max-w-xl text-sm sm:text-base leading-7 text-white/70">
                Already listed or new? Claim your profile to update your info, show in our directory list, and start attracting thousands of Vietnamese and Korean speaking patients.
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
                  onClick={() => scrollToSection('new-submission-form')}
                  className="brand-button bg-[var(--ahh-lime)] text-[var(--ahh-deep-teal)] hover:bg-[var(--ahh-lime)]/90 cursor-pointer font-bold"
                >
                  Submit a new Clinic Profile
                </button>
                <button
                  onClick={() => scrollToSection('claim-existing')}
                  className="brand-button border border-white bg-transparent text-white hover:bg-white/10 cursor-pointer font-bold"
                >
                  Claim an Existing Profile
                </button>
              </div>
            </div>

            {/* SVG Profile Mockup */}
            <div className="relative overflow-hidden rounded-[18px] bg-white/5 border border-white/10 p-6 flex flex-col justify-between shadow-2xl h-[340px] text-white">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold">Anchor Dental Georgia</h3>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                  </div>
                  <p className="text-xs text-white/60 mt-1">Duluth, Georgia</p>
                </div>
                <span className="text-2xs bg-emerald-500/20 text-emerald-300 font-extrabold uppercase px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Verified
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-white/80">
                  <span className="text-white/40">Specialty:</span>
                  <span className="font-semibold bg-white/10 px-2 py-0.5 rounded-md text-2xs">Dental</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/80">
                  <span className="text-white/40">Languages:</span>
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md text-2xs font-bold">Vietnamese</span>
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md text-2xs font-bold">English</span>
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

        {/* Claim Existing Profile Section */}
        <section id="claim-existing" className="scroll-mt-28 home-section grid gap-10 rounded-[16px] bg-[var(--ahh-mist-2)] px-5 py-16 sm:px-10 lg:grid-cols-[1fr_minmax(0,1.2fr)] lg:items-center lg:px-20">
          <div className="space-y-6">
            <h2 className="text-[28px] sm:text-[34px] font-bold leading-tight text-[var(--ahh-ink)]">
              Claim an Existing Clinic Profile
            </h2>
            <p className="text-sm leading-7 text-[var(--ahh-muted)]">
              If your clinic is already listed on Asian Health Hub, you can claim ownership of it. This will let you keep your information accurate and up to date. Claiming is free, fast, and takes less than 5 minutes.
            </p>
            <Link href="/search" className="brand-button-secondary inline-flex items-center gap-1.5 font-bold cursor-pointer">
              Search & Claim Profile
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

        {/* New Clinic Submission Form Section */}
        <section id="new-submission-form" className="scroll-mt-28 home-section rounded-[16px] bg-white p-6 sm:p-10 lg:p-12 border border-[var(--ahh-border)] shadow-3xs">
          {isSuccess ? (
            <div className="text-center py-12 space-y-6 max-w-md mx-auto">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mx-auto">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-[var(--ahh-ink)]">Submission Successful!</h3>
                <p className="text-sm text-[var(--ahh-muted)] leading-relaxed">
                  Thank you for submitting your clinic profile information. Our verification team will review your application and contact you within 24-48 hours.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsSuccess(false);
                  setClinicName('');
                  setFullName('');
                  setRole('');
                  setEmail('');
                  setWebsite('');
                  setPhone('');
                  setUpdates({
                    profileInfo: false,
                    hoursLocation: false,
                    languageSupport: false,
                    specialtiesServices: false,
                    other: false,
                    missingClinic: false,
                  });
                  setNotes('');
                  setConsent(false);
                }}
                className="brand-button-secondary font-bold cursor-pointer"
              >
                Submit another profile
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-[var(--ahh-ink)]">New Clinic Submission Form</h2>
                <p className="text-xs text-[var(--ahh-muted)] mt-1.5">
                  Fields marked with an asterisk (*) are required.
                </p>
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Clinic Name */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-bold text-[var(--ahh-ink)]">
                      Clinic/Practice Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Type clinic name to search or add to our directory"
                      value={clinicName}
                      onChange={(e) => setClinicName(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                    />
                  </div>

                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--ahh-ink)]">
                      Your Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Dr. Tom Nguyen"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                    />
                  </div>

                  {/* Role */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--ahh-ink)]">
                      Your Role at the Clinic *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Owner / Medical Director / Practice Manager / Other"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                    />
                  </div>

                  {/* Clinic Email */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-bold text-[var(--ahh-ink)]">
                      Clinic Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="info@clinicdomain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                    />
                  </div>

                  {/* Clinic Website */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--ahh-ink)]">
                      Clinic Website Address
                    </label>
                    <input
                      type="url"
                      placeholder="Website URL (e.g. www.clinicname.com)"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                    />
                  </div>

                  {/* Phone Number */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--ahh-ink)]">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="Public facing phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors"
                    />
                  </div>
                </div>

                {/* What would you like to update */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-[var(--ahh-ink)] block">
                    What Would You Like to Update? (Select all that apply)
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex items-center gap-2.5 rounded-xl border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/30 p-3 text-xs font-semibold text-gray-700 cursor-pointer select-none hover:bg-white">
                      <input
                        type="checkbox"
                        checked={updates.profileInfo}
                        onChange={() => handleCheckboxChange('profileInfo')}
                        className="rounded border-gray-300 text-[var(--ahh-deep-teal)] focus:ring-[var(--ahh-deep-teal)] h-4 w-4"
                      />
                      <span>Profile Info</span>
                    </label>

                    <label className="flex items-center gap-2.5 rounded-xl border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/30 p-3 text-xs font-semibold text-gray-700 cursor-pointer select-none hover:bg-white">
                      <input
                        type="checkbox"
                        checked={updates.hoursLocation}
                        onChange={() => handleCheckboxChange('hoursLocation')}
                        className="rounded border-gray-300 text-[var(--ahh-deep-teal)] focus:ring-[var(--ahh-deep-teal)] h-4 w-4"
                      />
                      <span>Hours & Location</span>
                    </label>

                    <label className="flex items-center gap-2.5 rounded-xl border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/30 p-3 text-xs font-semibold text-gray-700 cursor-pointer select-none hover:bg-white">
                      <input
                        type="checkbox"
                        checked={updates.languageSupport}
                        onChange={() => handleCheckboxChange('languageSupport')}
                        className="rounded border-gray-300 text-[var(--ahh-deep-teal)] focus:ring-[var(--ahh-deep-teal)] h-4 w-4"
                      />
                      <span>Language Support</span>
                    </label>

                    <label className="flex items-center gap-2.5 rounded-xl border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/30 p-3 text-xs font-semibold text-gray-700 cursor-pointer select-none hover:bg-white">
                      <input
                        type="checkbox"
                        checked={updates.specialtiesServices}
                        onChange={() => handleCheckboxChange('specialtiesServices')}
                        className="rounded border-gray-300 text-[var(--ahh-deep-teal)] focus:ring-[var(--ahh-deep-teal)] h-4 w-4"
                      />
                      <span>Specialties & Services</span>
                    </label>

                    <label className="flex items-center gap-2.5 rounded-xl border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/30 p-3 text-xs font-semibold text-gray-700 cursor-pointer select-none hover:bg-white">
                      <input
                        type="checkbox"
                        checked={updates.other}
                        onChange={() => handleCheckboxChange('other')}
                        className="rounded border-gray-300 text-[var(--ahh-deep-teal)] focus:ring-[var(--ahh-deep-teal)] h-4 w-4"
                      />
                      <span>Other (please note below)</span>
                    </label>

                    <label className="flex items-center gap-2.5 rounded-xl border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/30 p-3 text-xs font-semibold text-gray-700 cursor-pointer select-none hover:bg-white">
                      <input
                        type="checkbox"
                        checked={updates.missingClinic}
                        onChange={() => handleCheckboxChange('missingClinic')}
                        className="rounded border-gray-300 text-[var(--ahh-deep-teal)] focus:ring-[var(--ahh-deep-teal)] h-4 w-4"
                      />
                      <span>Missing Clinic (Add new)</span>
                    </label>
                  </div>
                </div>

                {/* Additional Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--ahh-ink)] block">
                    Add Some Notes (Update details | Max 500 characters)
                  </label>
                  <textarea
                    maxLength={500}
                    placeholder="We also offer Acupuncture and Nutrition counseling..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full p-3.5 rounded-lg border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)]/50 focus:bg-white text-sm text-[var(--ahh-ink)] outline-none focus:border-[var(--ahh-deep-teal)] focus:ring-1 focus:ring-[var(--ahh-deep-teal)] transition-colors resize-y"
                  />
                </div>

                {/* Consent & Submit */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <label className="flex items-start gap-2.5 text-xs text-gray-600 font-semibold cursor-pointer max-w-xl select-none">
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-[var(--ahh-deep-teal)] focus:ring-[var(--ahh-deep-teal)] h-4 w-4 shrink-0"
                    />
                    <span>
                      I confirm I am authorized to manage this clinic profile and the information I have provided is accurate. *
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="brand-button-secondary px-8 font-bold flex items-center justify-center shrink-0 min-h-10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Submitting...
                      </span>
                    ) : (
                      'Submit Profile'
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
