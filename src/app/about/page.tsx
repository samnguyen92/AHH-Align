import type { Metadata } from 'next';
import Link from 'next/link';
import { HeartHandshake, Languages, ShieldCheck, Users } from 'lucide-react';
import { ArrowCircle, Caption, Display, Grid, Heading, Page, PhotoTile, Pill, Tile, ring, tile, pad } from '@/components/site/ui';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Asian Health Hub helps Vietnamese, Korean, and Chinese-speaking patients find language-accessible clinics across the United States.',
  alternates: {
    canonical: '/about',
  },
};

const stats = [
  { value: '9', label: 'Medical specialties covered in the directory' },
  { value: '10', label: 'Top Asian population metros coast to coast' },
  { value: '3+', label: 'Languages supported: Vietnamese, Korean and Chinese' },
  { value: '100%', label: 'Free for patients and families, always' },
] as const;

const storyPoints = [
  {
    k: '3.4M+ patients',
    title: 'Closing the communication gap',
    image: '/brand/photos/a2-section2.webp',
  },
  {
    k: 'Verified profiles',
    title: 'Clear language and specialty details',
    image: '/brand/photos/a4-guide-right.webp',
  },
  {
    k: 'Under 5 minutes',
    title: 'From search to direct booking',
    image: '/brand/photos/h2-step-filter.webp',
  },
] as const;

const values = [
  {
    title: 'Language First',
    icon: Languages,
  },
  {
    title: 'Radical Transparency',
    icon: ShieldCheck,
  },
  {
    title: 'Free for Patients',
    icon: HeartHandshake,
  },
  {
    title: 'Community First',
    icon: Users,
  },
] as const;

const steps = [
  {
    title: 'Search the directory',
    image: '/brand/photos/b3-steps.webp',
  },
  {
    title: 'Compare clinic profiles',
    image: '/brand/photos/h3-step-compare.webp',
  },
  {
    title: 'Filter by city or language',
    image: '/brand/photos/a3-guide-left.webp',
  },
  {
    title: 'Contact the clinic',
    image: '/brand/photos/clinic-3.webp',
  },
] as const;

// alternating tones so the values row reads as a pattern, like the home page's specialty tiles
const VALUE_TONES = ['mint', 'cream', 'mint', 'cream'] as const;

export default function AboutPage() {
  return (
    <Page>
      {/* 1. Hero: the title tile beside the photo */}
      <Grid className="md:min-h-[calc(100svh-7.25rem)] md:grid-cols-2">
        <Tile tone="stone" as="header" className={`flex min-h-[28rem] flex-col justify-between gap-10 ${pad}`}>
          <Caption>About Asian Health Hub</Caption>
          <div>
            <Display as="h1">
              Care in
              <br />
              the language
              <br />
              you trust
            </Display>
            <Caption className="mt-5 max-w-[46ch] opacity-75">Connecting Vietnamese, Korean and Chinese-speaking families with clinics that speak their language</Caption>
            <div className="mt-7 flex flex-wrap gap-2">
              <Pill href="/search">Find a Clinic</Pill>
              <Pill href="/claim" variant="line">Claim a Free Profile</Pill>
            </div>
          </div>
        </Tile>
        <div className="relative min-h-[22rem]">
          <PhotoTile src="/brand/photos/h1-hero.webp" alt="A doctor talking with an older patient and his daughter" className="h-full min-h-[22rem]" eager />
          <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-white/90 p-4 backdrop-blur-md md:bottom-5 md:left-5 md:right-auto md:max-w-sm md:rounded-2xl md:p-5">
            <p className="text-4xl font-bold leading-none tracking-tight md:text-5xl">3.4M+</p>
            <p className="mt-2 text-xs font-semibold md:text-sm">Vietnamese and Korean Americans face language barriers in care</p>
          </div>
        </div>
      </Grid>

      {/* 2. Our story: the claim, then three proof tiles */}
      <Grid className="md:grid-cols-4">
        <Tile tone="ink" className={`flex min-h-[20rem] flex-col justify-between gap-8 ${pad}`}>
          <Caption className="opacity-70">Our story</Caption>
          <div>
            <Heading as="h2" className="md:text-4xl">Healthcare is too important to be limited by language.</Heading>
          </div>
        </Tile>
        {storyPoints.map((p) => (
          <Tile key={p.title} tone="none" className="group flex min-h-[26rem] flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
            <div className="relative mt-auto p-4 text-white md:p-6">
              <span className="inline-flex rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-[#0D1F1C]">{p.k}</span>
              <h3 className="mt-3 text-xl font-bold leading-tight md:text-2xl">{p.title}</h3>
            </div>
          </Tile>
        ))}
      </Grid>

      {/* 3. Mission and vision */}
      <Grid id="mission" className="md:grid-cols-2">
        <PhotoTile
          src="/brand/photos/a5-tall-portrait.webp"
          alt="A grandmother with her two granddaughters"
          className="min-h-[22rem] md:min-h-[36rem]"
        />
        <Tile tone="mint" className={`flex flex-col justify-between gap-10 ${pad}`}>
          <Display>
            Mission
            <br />
            &amp; vision
          </Display>
          <div className="grid gap-6">
            <div>
              <Caption className="text-[#024E44]">Our mission</Caption>
              <p className="mt-2 text-2xl font-bold leading-tight md:text-3xl">Care in your language, easy to find and free.</p>
            </div>
            <div>
              <Caption className="text-[#024E44]">Our vision</Caption>
              <p className="mt-2 text-2xl font-bold leading-tight md:text-3xl">The right clinic in under five minutes, anywhere.</p>
            </div>
          </div>
        </Tile>
      </Grid>

      {/* 4. Numbers */}
      <Grid className="grid-cols-2 md:grid-cols-4">
        {stats.map((s, i) => (
          <Tile key={s.label} tone={i === 0 ? 'green' : 'stone'} className={`flex min-h-[12rem] flex-col justify-between gap-6 ${pad}`}>
            <span className="text-[clamp(3.5rem,8vw,8rem)] font-bold leading-[0.8] tracking-tight tabular-nums">{s.value}</span>
            <Caption className={i === 0 ? 'opacity-85' : 'opacity-75'}>{s.label}</Caption>
          </Tile>
        ))}
      </Grid>

      {/* 5. What we stand for */}
      <Grid className="md:grid-cols-4">
        <Tile tone="zinc" className={`isolate flex min-h-[16rem] flex-col justify-end gap-4 md:col-span-4 md:min-h-[24rem] md:flex-row md:items-end md:justify-between ${pad}`}>
          {/* the four values' icons, large and faint, drifting across the empty top of the tile (as on the home page) */}
          <div className="site-spec-drift pointer-events-none absolute inset-x-0 top-[10%] -z-10 flex w-max opacity-[0.08]" aria-hidden="true">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center gap-[clamp(2.5rem,5vw,5rem)] pr-[clamp(2.5rem,5vw,5rem)]">
                {[...values, ...values].map((v, k) => {
                  const Icon = v.icon;
                  return <Icon key={k} className="h-[clamp(5rem,11vw,10rem)] w-auto" strokeWidth={1.1} />;
                })}
              </div>
            ))}
          </div>
          <Display>What we stand for</Display>
          <Caption className="max-w-xs md:text-right">The principles that shape how we build Asian Health Hub and serve our community</Caption>
        </Tile>
        {values.map((v, i) => {
          const Icon = v.icon;
          return (
            <Tile key={v.title} tone={VALUE_TONES[i]} className={`isolate flex min-h-[16rem] flex-col justify-between gap-8 ${pad}`}>
              <Icon className="pointer-events-none absolute -top-[10%] right-0 -z-10 h-[125%] w-auto translate-x-[34%] opacity-[0.07]" strokeWidth={1} aria-hidden="true" />
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/70">
                <Icon className="h-7 w-7" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <h3 className="text-xl font-bold leading-tight md:text-2xl">{v.title}</h3>
            </Tile>
          );
        })}
      </Grid>

      {/* 6. How it works */}
      <Grid className="md:grid-cols-4">
        {steps.map((s, i) => (
          <Tile key={s.title} tone={i % 2 ? 'zinc' : 'stone'} className="flex min-h-[30rem] flex-col">
            <div className={pad}>
              <span className="block text-[clamp(4rem,8vw,8rem)] font-bold leading-[0.8] tracking-tight tabular-nums">0{i + 1}</span>
              <h3 className="mt-4 text-xl font-bold md:text-2xl">{s.title}</h3>
            </div>
            <div className="mx-2 mb-2 mt-auto min-h-[12rem] flex-1 overflow-hidden rounded-xl md:mx-3 md:mb-3 md:rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          </Tile>
        ))}
      </Grid>

      {/* 7. Closing: directory and claim */}
      <Grid className="md:grid-cols-4">
        <Link href="/search" className={`group relative min-h-[24rem] overflow-hidden md:col-span-3 ${tile} ${ring}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/photos/a1-hero.webp" alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-6 text-white md:bottom-7 md:left-7 md:right-7">
            <div>
              <h2 className="max-w-[16ch] text-[clamp(2rem,4.5vw,4.5rem)] font-bold leading-[0.95] tracking-tight">Ready to find care your family trusts?</h2>
            </div>
            <ArrowCircle light />
          </div>
        </Link>
        <Tile tone="mint" className={`flex min-h-[18rem] flex-col justify-between gap-6 ${pad}`}>
          <div>
            <Caption className="text-[#024E44]">For clinics</Caption>
            <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">
              Claim
              <br />
              your free
              <br />
              profile
            </h3>
          </div>
          <Pill href="/claim" className="self-start">Claim Now</Pill>
        </Tile>
      </Grid>
    </Page>
  );
}
