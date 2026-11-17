"use client";

import { useState } from 'react';
import { BadgeCheck, Check, CheckCircle2, Edit3, ImagePlus, Info, Languages, Star } from 'lucide-react';
import { Caption, Display, Grid, Page, Pill, Roll, Tile, pad, ring } from '@/components/site/ui';

const STEPS = [
  { title: 'Find your clinic' },
  { title: 'Submit ownership' },
  { title: 'AHH verifies' },
  { title: 'Access granted' },
] as const;

const PERKS = [
  { title: 'Edit information', icon: Edit3 },
  { title: 'Language support', icon: Languages },
  { title: 'Photos and logo', icon: ImagePlus },
] as const;

const UPDATE_OPTIONS = [
  ['profileInfo', 'Profile info'],
  ['hoursLocation', 'Hours and location'],
  ['languageSupport', 'Language support'],
  ['specialtiesServices', 'Specialties and services'],
  ['other', 'Other (note below)'],
  ['missingClinic', 'Missing clinic (add new)'],
] as const;

const btn = `inline-flex min-h-12 shrink-0 items-center justify-center rounded-full px-6 text-sm font-bold md:text-base ${ring} btn-fx`;
const input =
  'h-12 w-full rounded-full bg-stone-50 px-5 text-base font-medium outline-none ring-1 ring-[#0D1F1C]/10 transition placeholder:text-[#0D1F1C]/40 focus:bg-white focus:ring-2 focus:ring-[#024E44]';

export default function ClaimLandingPage() {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
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
      // Build a human-readable summary of requested updates
      const checkedUpdates = Object.entries(updates)
        .filter(([, v]) => v)
        .map(([k]) => k.replace(/([A-Z])/g, ' $1').trim())
        .join(', ');

      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_name: clinicName,
          full_name: fullName,
          role,
          email,
          phone,
          website,
          updates: [checkedUpdates, notes].filter(Boolean).join(' — '),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to submit ownership request. Please try again.');
        return;
      }

      setIsSuccess(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };



  const resetForm = () => {
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
  };

  return (
    <Page>
      {/* Hero: the offer beside a sample profile */}
      <Grid className="md:grid-cols-2">
        <Tile tone="green" as="header" className={`flex min-h-[30rem] flex-col justify-between gap-10 ${pad}`}>
          <Caption className="opacity-80">Claim your free clinic profile</Caption>
          <div>
            <h1 className="max-w-[16ch] text-[clamp(2.5rem,5.4vw,5.5rem)] font-bold leading-[0.95] tracking-tight">
              Reach Vietnamese &amp; Korean patients
            </h1>
            <Caption className="mt-5 opacity-85">Already listed or new, it is free</Caption>
            <ul className="mt-6 flex flex-wrap gap-1.5 text-xs font-semibold">
              {['#1 Clinics in AHH lists', 'No fees', 'Targeted patients'].map((x) => (
                <li key={x} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {x}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-2">
              <button type="button" onClick={() => scrollToSection('new-submission-form')} className={`${btn} btn-fx--green bg-white text-[#0D1F1C]`}>
                <Roll>Submit a new clinic</Roll>
              </button>
              <button type="button" onClick={() => scrollToSection('claim-existing')} className={`${btn} btn-fx--white border border-white text-white`}>
                <Roll>Claim an existing profile</Roll>
              </button>
            </div>
          </div>
        </Tile>

        {/* sample of what a claimed profile shows */}
        <Tile tone="mint" className={`flex min-h-[22rem] flex-col justify-center ${pad}`}>
          <div className="rounded-xl bg-white p-5 shadow-[0_20px_50px_-20px_rgba(13,31,28,0.25)] md:rounded-2xl md:p-6" aria-label="Example clinic profile">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold opacity-60">Dental</p>
                <h2 className="mt-1 text-2xl font-bold leading-tight">Anchor Dental Georgia</h2>
                <p className="mt-1 text-sm opacity-70">Duluth, Georgia</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E3F1EC] px-2.5 py-1 text-xs font-bold text-[#024E44]">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Verified
              </span>
            </div>
            <p className="mt-4 inline-flex items-center gap-1 text-sm font-bold">
              <Star className="h-4 w-4 text-[#024E44]" fill="currentColor" aria-hidden="true" />
              4.9 <span className="font-medium opacity-55">(84 reviews)</span>
            </p>
            <p className="mt-3 flex flex-wrap gap-1">
              {['Vietnamese', 'English'].map((l) => (
                <span key={l} className="rounded-full bg-[#E3F1EC] px-2.5 py-0.5 text-xs font-semibold text-[#024E44]">{l}</span>
              ))}
            </p>
            <p className="mt-5 border-t border-[#0D1F1C]/10 pt-4 text-xs font-semibold opacity-60">Attracting patients 24/7</p>
          </div>
        </Tile>
      </Grid>

      {/* How it works */}
      <Grid className="sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Tile key={s.title} tone={i % 2 ? 'zinc' : 'stone'} className={`flex min-h-[17rem] flex-col justify-between gap-6 ${pad}`}>
            <span className="text-[clamp(3.5rem,6vw,6rem)] font-bold leading-[0.8] tracking-tight tabular-nums">0{i + 1}</span>
            <h3 className="text-xl font-bold leading-tight md:text-2xl">{s.title}</h3>
          </Tile>
        ))}
      </Grid>

      {/* Claim an existing profile */}
      <Grid id="claim-existing" className="scroll-mt-28 md:grid-cols-4">
        <Tile tone="ink" className={`flex min-h-[18rem] flex-col justify-between gap-8 md:col-span-1 ${pad}`}>
          <h2 className="text-3xl font-bold leading-[1.02] tracking-tight md:text-4xl">Claim an existing profile</h2>
          <Pill href="/search" variant="white" className="self-start">Search &amp; claim</Pill>
        </Tile>
        {PERKS.map((perk, i) => {
          const Icon = perk.icon;
          return (
            <Tile key={perk.title} tone={i % 2 ? 'cream' : 'mint'} className={`isolate flex min-h-[18rem] flex-col justify-between gap-6 ${pad}`}>
              <Icon className="pointer-events-none absolute -top-[10%] right-0 -z-10 h-[125%] w-auto translate-x-[34%] opacity-[0.07]" strokeWidth={1} aria-hidden="true" />
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/70">
                <Icon className="h-7 w-7" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <h3 className="text-xl font-bold leading-tight md:text-2xl">{perk.title}</h3>
            </Tile>
          );
        })}
      </Grid>

      {/* New clinic submission */}
      <Grid id="new-submission-form" className="scroll-mt-28 lg:grid-cols-4">
        <Tile tone="stone" className={`flex min-h-[14rem] flex-col justify-between gap-6 ${pad}`}>
          <Display size="text-[clamp(2.5rem,4.6vw,4.5rem)]">
            Submit
            <br />
            a clinic
          </Display>
          <Caption className="opacity-70">Reviewed within 24 to 48 hours</Caption>
        </Tile>
        <Tile tone="none" className={`bg-white ring-1 ring-[#0D1F1C]/10 lg:col-span-3 ${pad}`}>
          {isSuccess ? (
            <div className="mx-auto max-w-md space-y-6 py-12 text-center" role="status">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#E3F1EC] text-[#024E44]">
                <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
              </span>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">Submission received</h3>
                <p className="text-sm font-medium leading-relaxed opacity-75">
                  Thank you for submitting your clinic profile information. Our verification team will review your application
                  and contact you within 24-48 hours.
                </p>
              </div>
              <button type="button" onClick={resetForm} className={`${btn} btn-fx--green border border-[#0D1F1C]`}>
                <Roll>Submit another profile</Roll>
              </button>
            </div>
          ) : (
            <form onSubmit={handleFormSubmit} className="space-y-6">
              {error && (
                <p className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">
                  <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="claim-clinic" label="Clinic or practice name *" className="sm:col-span-2">
                  <input id="claim-clinic" type="text" required placeholder="Type clinic name" value={clinicName} onChange={(e) => setClinicName(e.target.value)} className={input} />
                </Field>
                <Field id="claim-name" label="Your full name *">
                  <input id="claim-name" type="text" required placeholder="e.g., Dr. Tom Nguyen" value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
                </Field>
                <Field id="claim-role" label="Your role at the clinic *">
                  <input id="claim-role" type="text" required placeholder="Owner, medical director, practice manager…" value={role} onChange={(e) => setRole(e.target.value)} className={input} />
                </Field>
                <Field id="claim-email" label="Clinic email address *" className="sm:col-span-2">
                  <input id="claim-email" type="email" required placeholder="info@clinicdomain.com" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
                </Field>
                <Field id="claim-web" label="Clinic website">
                  <input id="claim-web" type="url" placeholder="www.clinicname.com" value={website} onChange={(e) => setWebsite(e.target.value)} className={input} />
                </Field>
                <Field id="claim-phone" label="Phone number *">
                  <input id="claim-phone" type="tel" required placeholder="Public facing phone number" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
                </Field>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-bold">What would you like to update? <span className="font-medium opacity-60">(select all that apply)</span></legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {UPDATE_OPTIONS.map(([key, label]) => (
                    <label
                      key={key}
                      className={`flex min-h-12 cursor-pointer select-none items-center gap-3 rounded-full px-4 text-sm font-semibold transition-colors ${
                        updates[key] ? 'bg-[#0D1F1C] text-white' : 'bg-stone-50 hover:bg-[#E3F1EC]'
                      }`}
                    >
                      <input type="checkbox" checked={updates[key]} onChange={() => handleCheckboxChange(key)} className="h-4 w-4 shrink-0 accent-[#024E44]" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field id="claim-notes" label="Notes (max 500 characters)">
                <textarea
                  id="claim-notes"
                  maxLength={500}
                  placeholder="We also offer acupuncture and nutrition counseling…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className={`${input} h-auto resize-y rounded-2xl py-3`}
                />
              </Field>

              <div className="flex flex-col gap-4 border-t border-[#0D1F1C]/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex max-w-xl cursor-pointer select-none items-start gap-3 text-sm font-medium">
                  <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#024E44]" />
                  <span>I confirm I am authorized to manage this clinic profile and the information I have provided is accurate. *</span>
                </label>
                <button type="submit" disabled={isSubmitting} className={`${btn} bg-[#024E44] text-white disabled:cursor-not-allowed disabled:opacity-50`}>
                  <Roll>{isSubmitting ? 'Submitting…' : 'Submit profile'}</Roll>
                </button>
              </div>
            </form>
          )}
        </Tile>
      </Grid>
    </Page>
  );
}

function Field({ id, label, className = '', children }: { id: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label htmlFor={id} className="block text-sm font-bold">{label}</label>
      {children}
    </div>
  );
}
