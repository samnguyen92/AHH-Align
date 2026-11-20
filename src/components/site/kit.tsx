'use client';

// The site's shared building blocks (design option A, "Mosaic"): routes, nav, tokens.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Roll } from './ui';
import { forwardRef, useEffect, useState } from 'react';
import { Baby, Bone, Brain, Eye, Flower2, HeartPulse, Sparkles, Stethoscope, type LucideIcon, type LucideProps } from 'lucide-react';

const Tooth = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
  <svg ref={ref} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3.5c-1.5-1.5-4.7-1.3-6.3.2-2.3 2.2-1.8 6.1-.7 9.1.5 1.4 1.5 5.3 3.1 6.6.7.6 1.5.2 1.8-.8l1.1-3.8c.3-1 1.7-1 2 0l1.1 3.8c.3 1 1.1 1.4 1.8.8 1.6-1.3 2.6-5.2 3.1-6.6 1.1-3 1.6-6.9-.7-9.1-1.6-1.5-4.8-1.7-6.3-.2Z" />
  </svg>
));
Tooth.displayName = 'Tooth';
import { LanguageSwitcher, useLocale } from '@/lib/i18n/context';

export const HOME = '/';
export const DIRECTORY = '/search';
export const clinicHref = (slug: string) => `/clinics/${slug}`;

export const EASE = 'cubic-bezier(0.76,0,0.24,1)';
export const INK = '#0D1F1C';

export const SPEC_INFO: Record<string, { icon: LucideIcon; blurb: string }> = {
  'Primary Care': { icon: Stethoscope, blurb: 'Check-ups, chronic care, referrals' },
  Dental: { icon: Tooth, blurb: 'Cleanings, fillings, orthodontics' },
  'Mental Health': { icon: Brain, blurb: 'Counseling and psychiatry' },
  'OB/GYN': { icon: Flower2, blurb: 'Pregnancy and women’s health' },
  Pediatrics: { icon: Baby, blurb: 'Babies, kids and teens' },
  Cardiology: { icon: HeartPulse, blurb: 'Heart and blood pressure' },
  Ophthalmology: { icon: Eye, blurb: 'Eye exams and eye surgery' },
  Dermatology: { icon: Sparkles, blurb: 'Skin, hair and nails' },
  Orthopedics: { icon: Bone, blurb: 'Bones, joints and sports injuries' },
};

/** the site's sections, same set as the previous header */
export const NAV_LINKS: [string, string][] = [
  ['Directory', DIRECTORY],
  ['Health Guides', '/insights'],
  ['Pulse', '/pulse'],
  ['About', '/about'],
];

/** true while the user is scrolling down past the top: the floating menu slides away, and returns on any scroll up */
export function useHideOnScrollDown(threshold = 80) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const dy = y - last;
        if (Math.abs(dy) < 6) return; // ignore tiny jitters (trackpads)
        setHidden(dy > 0 && y > threshold);
        last = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [threshold]);
  return hidden;
}

export function Navbar() {
  const pathname = usePathname();
  const { t } = useLocale();
  const navLinks: [string, string][] = [
    [t.nav.directory, DIRECTORY],
    [t.nav.healthGuides, '/insights'],
    [t.nav.pulse, '/pulse'],
    [t.nav.about, '/about'],
  ];
  const isCurrent = (href: string) => (href === HOME ? pathname === HOME : pathname === href || pathname.startsWith(`${href}/`));
  const [open, setOpen] = useState(false);
  const scrolledAway = useHideOnScrollDown();
  const hidden = scrolledAway && !open;
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const line = `absolute h-0.5 w-6 rounded-full transition-all duration-300`;
  return (
    <>
      {/* Floating menu: a full-width bar inset and rounded like the cards; logo left, sections centred, actions right.
          Slides up out of view on scroll down. */}
      <header
        className={`fixed left-3 right-3 top-2 z-50 flex items-center justify-between gap-4 rounded-xl md:rounded-2xl bg-white/85 py-2 pl-6 pr-3 shadow-[0_8px_30px_rgba(13,31,28,0.08)] ring-1 ring-black/5 backdrop-blur-md transition-transform duration-500 md:left-5 md:right-5 md:top-3 md:py-2.5 md:pl-7 md:pr-2.5 ${
          hidden ? '-translate-y-[130%]' : 'translate-y-0'
        }`}
        style={{ transitionTimingFunction: EASE }}
      >
        <Link href={HOME} className="flex flex-col" style={{ color: INK }} aria-label="Asian Health Hub home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ahh-logo-2026-dark.svg" alt="Asian Health Hub" width="180" height="86" className="h-10 w-auto" />
        </Link>
        {/* section links, centred on the bar; below 1024px they live in the slide-out menu */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 lg:flex" aria-label="Main">
          {navLinks.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={isCurrent(href) ? 'page' : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-[#E3F1EC] aria-[current=page]:bg-[#E3F1EC] ${focusRing}`}
              style={{ color: INK }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <LanguageSwitcher variant="light" />
          <Link href="/claim" className="text-sm font-semibold underline-offset-4 hover:underline" style={{ color: INK }}>
            {t.nav.forClinics}
          </Link>
          <Link
            href={DIRECTORY}
            className="btn-fx btn-fx--green rounded-full border border-[#0D1F1C] px-5 py-2.5 text-sm font-semibold text-[#0D1F1C]"
          >
            <Roll>{t.nav.findClinic}</Roll>
          </Link>
        </div>
        <button
          type="button"
          className="relative flex h-11 w-11 items-center justify-center lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`${line} ${open ? 'translate-y-0 rotate-45' : '-translate-y-2'}`} style={{ background: INK, transitionTimingFunction: EASE }} />
          <span className={`${line} ${open ? 'scale-x-0 opacity-0' : 'scale-x-100 opacity-100'}`} style={{ background: INK, transitionTimingFunction: EASE }} />
          <span className={`${line} ${open ? 'translate-y-0 -rotate-45' : 'translate-y-2'}`} style={{ background: INK, transitionTimingFunction: EASE }} />
        </button>
      </header>

      <div className={`fixed inset-0 z-40 lg:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-500 ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute right-0 top-0 h-full w-[85%] max-w-sm bg-white shadow-2xl transition-transform duration-500 ${open ? 'translate-x-0' : 'translate-x-full'}`}
          style={{ transitionTimingFunction: EASE }}
        >
          <div className="flex h-full flex-col justify-center gap-1 px-8">
            <div className="mb-4">
              <LanguageSwitcher variant="light" />
            </div>
            {navLinks.map(([label, href], i) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
                className={`py-1 text-4xl font-bold transition-all duration-500 hover:text-[#024E44] ${open ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}`}
                style={{ color: INK, transitionDelay: open ? `${100 + i * 60}ms` : '0ms', transitionTimingFunction: EASE }}
              >
                {label}
              </Link>
            ))}
            <div
              className={`mt-8 border-t border-neutral-200 pt-8 transition-all duration-500 ${open ? 'opacity-100' : 'opacity-0'}`}
              style={{ transitionDelay: open ? '450ms' : '0ms' }}
            >
              <p className="mb-4 text-sm font-semibold" style={{ color: INK }}>{t.nav.runClinic}</p>
              <Link
                href="/claim"
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
                className="btn-fx block w-full rounded-full bg-[#024E44] px-6 py-4 text-center text-sm font-semibold text-white"
              >
                {t.nav.claimFreeProfile}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- arrow */

export function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="rotate-[-45deg]" aria-hidden="true">
      <path d="M1 7h12m0 0L8 2m5 5L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ----------------------------------------------------------------- page */

export const card = 'rounded-xl md:rounded-2xl overflow-hidden relative';
export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#024E44]';
export const section = 'w-full px-3 md:px-5 pb-1.5 md:pb-2 pt-1.5 md:pt-2';
