'use client';

import { BadgeCheck, Check, Edit3, ImagePlus, Languages, Star } from 'lucide-react';
import { ClaimRequestForm } from './claim-request-form';
import { Caption, Display, Grid, Page, Pill, Roll, Tile, pad, ring } from '@/components/site/ui';
import type { Clinic } from '@/types/database';

interface ClaimClinicLayoutProps {
  clinic: Clinic;
}

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

const btn = `inline-flex min-h-12 shrink-0 items-center justify-center rounded-full px-6 text-sm font-bold md:text-base ${ring} btn-fx`;

export function ClaimClinicLayout({ clinic }: ClaimClinicLayoutProps) {
  const scrollToForm = () => {
    document.getElementById('claim-form-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const locationText = [clinic.city, clinic.state].filter(Boolean).join(', ') || 'USA';
  const clinicSpecialty = clinic.specialty || 'General Practice';
  const languagesList = clinic.languages && clinic.languages.length > 0 ? clinic.languages : ['English'];
  const rating = typeof clinic.metadata?.rating === 'number' ? clinic.metadata.rating.toFixed(1) : null;
  const reviews = clinic.metadata?.rating_count ?? 0;

  return (
    <Page>
      {/* Hero: the claim beside this clinic's profile card */}
      <Grid className="md:grid-cols-2">
        <Tile tone="green" as="header" className={`flex min-h-[30rem] flex-col justify-between gap-10 ${pad}`}>
          <Caption className="opacity-80">Claim your free clinic profile</Caption>
          <div>
            <h1 className="max-w-[18ch] break-words text-[clamp(2.5rem,5vw,5rem)] font-bold leading-[0.95] tracking-tight">Claim {clinic.name}</h1>
            <Caption className="mt-5 opacity-85">Verify ownership to update languages, hours and services</Caption>
            <ul className="mt-6 flex flex-wrap gap-1.5 text-xs font-semibold">
              {['#1 Clinics in AHH lists', 'No fees', 'Targeted patients'].map((x) => (
                <li key={x} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {x}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-2">
              <button type="button" onClick={scrollToForm} className={`${btn} btn-fx--green bg-white text-[#0D1F1C]`}>
                <Roll>Fill out the claim form</Roll>
              </button>
              <Pill href="/claim" variant="line" onDark>Claim a different clinic</Pill>
            </div>
          </div>
        </Tile>

        <Tile tone="mint" className={`flex min-h-[22rem] flex-col justify-center ${pad}`}>
          <div className="rounded-xl bg-white p-5 shadow-[0_20px_50px_-20px_rgba(13,31,28,0.25)] md:rounded-2xl md:p-6" aria-label="Your clinic profile">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold opacity-60">{clinicSpecialty}</p>
                <h2 className="mt-1 line-clamp-2 text-2xl font-bold leading-tight">{clinic.name}</h2>
                <p className="mt-1 text-sm opacity-70">{locationText}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E3F1EC] px-2.5 py-1 text-xs font-bold text-[#024E44]">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {clinic.is_claimed ? 'Claimed' : 'Unclaimed'}
              </span>
            </div>
            {rating && (
              <p className="mt-4 inline-flex items-center gap-1 text-sm font-bold">
                <Star className="h-4 w-4 text-[#024E44]" fill="currentColor" aria-hidden="true" />
                {rating} <span className="font-medium opacity-55">({reviews.toLocaleString('en-US')} reviews)</span>
              </p>
            )}
            <p className="mt-3 flex flex-wrap gap-1">
              {languagesList.slice(0, 6).map((lang) => (
                <span key={lang} className="rounded-full bg-[#E3F1EC] px-2.5 py-0.5 text-xs font-semibold text-[#024E44]">{lang}</span>
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

      {/* The form beside what owners can change */}
      <Grid id="claim-form-section" className="scroll-mt-28 lg:grid-cols-4">
        <div className="flex flex-col gap-2 md:gap-3">
          <Tile tone="stone" className={`flex min-h-[12rem] flex-col justify-between gap-6 ${pad}`}>
            <Display size="text-[clamp(2.5rem,4.6vw,4.5rem)]">
              Verify
              <br />
              ownership
            </Display>
            <Caption className="opacity-70">We review every request within 24 to 48 hours.</Caption>
          </Tile>
          {PERKS.map((perk, i) => {
            const Icon = perk.icon;
            return (
              <Tile key={perk.title} tone={i % 2 ? 'cream' : 'mint'} className="flex items-center gap-4 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/70">
                  <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3 className="text-base font-bold">{perk.title}</h3>
              </Tile>
            );
          })}
        </div>
        <div className="lg:col-span-3">
          <ClaimRequestForm clinic={clinic} />
        </div>
      </Grid>
    </Page>
  );
}
