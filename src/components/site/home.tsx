'use client';

// Home page (design option A, "Mosaic": rounded photo tiles in a tight gutter).

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { PHOTOS, STEPS } from './content';
import type { HomeData } from './types';
import { ArrowUpRight, Stethoscope, Video } from 'lucide-react';
import { SiteImg } from './img';
import { Arrow, INK, DIRECTORY, SPEC_INFO, card, focusRing, clinicHref, section } from './kit';
import { STATE_SHAPES } from './state-shapes';
import { Roll } from './ui';

const HERO_IMAGE = PHOTOS.hero;
const SECTION2_IMAGE = PHOTOS.reception;
const SECTION3_IMG1 = PHOTOS.guideLeft;
const SECTION3_IMG2 = PHOTOS.guideRight;
const SECTION3_BG = PHOTOS.family;


/* ---------------------------------------------------------------- hooks */

type MaskPos = { x: number; y: number; sw: number; sh: number };

function useMaskPositions(sectionRef: RefObject<HTMLElement | null>, cardRefs: RefObject<(HTMLElement | null)[]>) {
  const [positions, setPositions] = useState<MaskPos[]>([]);
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const measure = () => {
      const s = section.getBoundingClientRect();
      setPositions(
        (cardRefs.current ?? []).map((el) => {
          if (!el) return { x: 0, y: 0, sw: s.width, sh: s.height };
          const r = el.getBoundingClientRect();
          return { x: r.left - s.left, y: r.top - s.top, sw: s.width, sh: s.height };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(section);
    return () => ro.disconnect();
  }, [sectionRef, cardRefs]);
  return positions;
}

type NaturalSize = { w: number; h: number } | null;

function useImageSize(src: string): NaturalSize {
  const [natural, setNatural] = useState<NaturalSize>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);
  return natural;
}

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const useIsMobile = () => useMedia('(max-width: 767px)');
const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');

function useStaggeredReveal(threshold = 0.15) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, threshold]);
  const getAnimStyle = useCallback(
    (i: number): CSSProperties =>
      reduced
        ? {}
        : {
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(24px)',
            transition: `opacity .6s cubic-bezier(0.16,1,0.3,1) ${i * 120}ms, transform .6s cubic-bezier(0.16,1,0.3,1) ${i * 120}ms`,
          },
    [visible, reduced],
  );
  return { attach: setEl, getAnimStyle };
}

/* ---------------------------------------------------------- masked card */

function MaskedCard({
  bgImage,
  position,
  natural,
  focalX,
  focalY = 0.5,
  className = '',
  style,
  cardRef,
  href,
  children,
}: {
  bgImage: string;
  position?: MaskPos;
  natural: NaturalSize;
  focalX: number;
  focalY?: number;
  className?: string;
  style?: CSSProperties;
  cardRef: (el: HTMLElement | null) => void;
  href?: string;
  children?: ReactNode;
}) {
  const p = position ?? { x: 0, y: 0, sw: 0, sh: 0 };
  // "cover" the whole section with one photo, then show each card's slice of it.
  const scale = natural && p.sw && p.sh ? Math.max(p.sw / natural.w, p.sh / natural.h) : 0;
  const bw = natural ? natural.w * scale : 0;
  const bh = natural ? natural.h * scale : 0;
  const ox = (bw - p.sw) * focalX;
  const oy = (bh - p.sh) * focalY;
  const bg: CSSProperties = {
    backgroundColor: '#E3F1EC',
    backgroundImage: scale ? `url(${bgImage})` : undefined,
    backgroundSize: `${bw}px ${bh}px`,
    backgroundPosition: `-${p.x + ox}px -${p.y + oy}px`,
    backgroundRepeat: 'no-repeat',
    ...style,
  };
  if (href) {
    return (
      <Link href={href} ref={cardRef as (el: HTMLAnchorElement | null) => void} className={className} style={bg}>
        {children}
      </Link>
    );
  }
  return (
    <div ref={cardRef as (el: HTMLDivElement | null) => void} className={className} style={bg}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- splash */

function SplashScreen({ total, onComplete }: { total: number; onComplete: () => void }) {
  const [n, setN] = useState(0);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const start = performance.now();
    const dur = 1200;
    let raf = 0;
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      setN(Math.round(total * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        t1 = setTimeout(() => setExiting(true), 200);
        t2 = setTimeout(onComplete, 900);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [total, onComplete]);
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-start bg-white transition-opacity duration-700 ${exiting ? 'opacity-0' : 'opacity-100'}`}
      aria-hidden="true"
    >
      <div className="p-6 md:p-10">
        <p className="mb-2 text-sm font-semibold text-[#B5521F] md:text-base">
          <span lang="vi">Xin chào</span> · <span lang="ko">안녕하세요</span> · <span lang="zh">您好</span>
        </p>
        <div className="flex items-baseline">
          <span className="text-7xl font-bold leading-none tabular-nums md:text-9xl" style={{ color: INK }}>
            {n}
          </span>
          <span className="ml-3 max-w-[12rem] text-sm font-semibold md:text-base" style={{ color: INK }}>
            clinics that speak your language
          </span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- navbar */


export function HomePage({ data }: { data: HomeData }) {
  const { counts } = data;
  const isMobile = useIsMobile();
  const reduced = useReducedMotion();
  const [showSplash, setShowSplash] = useState(false);
  useEffect(() => {
    if (reduced) return;
    let first = true;
    try {
      first = !sessionStorage.getItem('ahh-mosaic-splash');
      sessionStorage.setItem('ahh-mosaic-splash', '1');
    } catch {}
    if (!first) return;
    const id = requestAnimationFrame(() => setShowSplash(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  const endSplash = useCallback(() => setShowSplash(false), []);

  const bars = [
    { native: 'Tiếng Việt', lang: 'vi', name: 'Vietnamese-speaking clinics', count: counts.vi, href: '/search?language=Vietnamese' },
    { native: '한국어', lang: 'ko', name: 'Korean-speaking clinics', count: counts.ko, href: '/search?language=Korean' },
    { native: '中文', lang: 'zh', name: 'Chinese-speaking clinics', count: counts.zh, href: '/search?language=Chinese' },
  ];

  const s1Ref = useRef<HTMLElement | null>(null);
  const s1Cards = useRef<(HTMLElement | null)[]>([]);
  const s1Pos = useMaskPositions(s1Ref, s1Cards);
  const s1Img = useImageSize(HERO_IMAGE);
  const s1Reveal = useStaggeredReveal();
  const s1Focal = isMobile ? 0.7 : 0.8;

  const s2Ref = useRef<HTMLElement | null>(null);
  const s2Cards = useRef<(HTMLElement | null)[]>([]);
  const s2Pos = useMaskPositions(s2Ref, s2Cards);
  const s2Img = useImageSize(SECTION2_IMAGE);
  const s2Reveal = useStaggeredReveal();
  const s2Focal = isMobile ? 0.65 : 0.8;

  const sClinics = useStaggeredReveal();
  const sSpecs = useStaggeredReveal();
  const sSteps = useStaggeredReveal();
  const sCities = useStaggeredReveal();
  const sGuides = useStaggeredReveal();

  const stepPhotos = [PHOTOS.stepFilter, PHOTOS.stepCompare, PHOTOS.waitingRoom];
  const guideCards = data.guides.slice(0, 2);

  return (
    <div className="site-a bg-white" style={{ fontFamily: "'Be Vietnam Pro', sans-serif", color: INK }}>
      {showSplash && <SplashScreen total={counts.total} onComplete={endSplash} />}
      <div>
        {/* ================= 1. Hero (masked) ================= */}
        <section
          ref={(el) => {
            s1Ref.current = el;
            s1Reveal.attach(el);
          }}
          className="flex h-screen w-full flex-col gap-2 overflow-hidden px-3 pb-1.5 pt-20 md:gap-3 md:px-5 md:pb-2 md:pt-[5.375rem]"
        >
          <div className="grid shrink-0 grid-cols-3 gap-2 md:gap-3">
            {bars.map((bar, i) => (
              <MaskedCard
                key={bar.lang}
                href={bar.href}
                bgImage={HERO_IMAGE}
                position={s1Pos[i]}
                natural={s1Img}
                focalX={s1Focal}
                cardRef={(el) => (s1Cards.current[i] = el)}
                className={`${card} ${focusRing} h-24 w-full transition hover:brightness-105 md:h-32`}
                style={s1Reveal.getAnimStyle(i)}
              >
                <span className="relative z-10 flex h-full flex-col items-center justify-center gap-1 px-2 text-center md:gap-2 md:px-4">
                  <span lang={bar.lang} className="whitespace-nowrap text-base font-bold leading-none sm:text-xl md:text-4xl">{bar.native}</span>
                  <span className="text-xs font-semibold leading-tight opacity-80 md:text-base">
                    <span className="hidden md:inline">{bar.name} · </span>
                    {bar.count}
                    <span className="md:hidden"> clinics</span>
                  </span>
                </span>
              </MaskedCard>
            ))}
          </div>
          <MaskedCard
            bgImage={HERO_IMAGE}
            position={s1Pos[3]}
            natural={s1Img}
            focalX={s1Focal}
            cardRef={(el) => (s1Cards.current[3] = el)}
            className={`${card} min-h-0 w-full flex-1`}
            style={s1Reveal.getAnimStyle(3)}
          >
            {/* phones: everything stacked in the plain wall above the people, on a soft white wash */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-3/5 bg-gradient-to-b from-white/80 via-white/45 to-transparent md:hidden" />
            <div className="absolute inset-x-4 top-5 z-10 md:hidden">
              <span className="block text-xs font-semibold opacity-75">{counts.total} clinics across the United States</span>
              <h1 className="mt-2 text-[2.75rem] font-bold leading-[0.9] tracking-tight">
                Care in
                <br />
                your language
              </h1>
              <p className="mt-3 max-w-[19rem] text-sm font-medium leading-snug">
                Find clinics where staff speak Vietnamese, Korean or Chinese, then contact them directly. Free for every patient.
              </p>
              <Link
                href={DIRECTORY}
                className={`btn-fx mt-4 inline-flex rounded-full bg-[#0D1F1C] px-6 py-3 text-sm font-bold text-white ${focusRing}`}
              >
                <Roll>Find a Clinic</Roll>
              </Link>
            </div>

            {/* tablet and up: intro top left, headline bottom left, button bottom right */}
            <p className="absolute left-7 top-7 z-10 hidden max-w-[20.625rem] text-sm font-semibold leading-5 md:block">
              Find clinics where staff speak Vietnamese, Korean or Chinese, then contact them directly. Free for every patient.
            </p>
            <div className="absolute bottom-8 left-4 z-10 hidden md:block">
              <span className="mb-2 block text-sm font-semibold">{counts.total} clinics across the United States</span>
              <h1 className="text-[clamp(2.75rem,9vw,9rem)] font-bold leading-[0.86] tracking-tight">
                Care in
                <br />
                your language
              </h1>
            </div>
            <Link
              href={DIRECTORY}
              className={`absolute bottom-10 right-8 z-10 hidden btn-fx btn-fx--green rounded-full bg-white px-7 py-4 text-base font-bold md:block ${focusRing}`}
            >
              <Roll>Find a Clinic</Roll>
            </Link>
          </MaskedCard>
        </section>

        {/* ================= 2. Language promise (masked) ================= */}
        <section
          ref={(el) => {
            s2Ref.current = el;
            s2Reveal.attach(el);
          }}
          className={`${section} flex min-h-screen flex-col overflow-hidden md:h-screen`}
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2 md:grid-rows-[1fr_1fr] md:gap-3">
            <MaskedCard
              bgImage={SECTION2_IMAGE}
              position={s2Pos[0]}
              natural={s2Img}
              focalX={s2Focal}
              cardRef={(el) => (s2Cards.current[0] = el)}
              className={`${card} min-h-[11.25rem] md:min-h-0`}
              style={s2Reveal.getAnimStyle(0)}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/40" />
              <h2 className="absolute left-5 top-4 z-10 text-2xl font-bold text-white md:left-7 md:top-6 md:text-4xl">
                Your language, checked
              </h2>
              <p className="absolute bottom-4 left-5 right-5 z-10 text-xs font-semibold text-white md:bottom-6 md:left-7 md:text-sm">
                Every listing shows which languages the clinic’s staff speak
              </p>
            </MaskedCard>
            <MaskedCard
              bgImage={SECTION2_IMAGE}
              position={s2Pos[1]}
              natural={s2Img}
              focalX={s2Focal}
              cardRef={(el) => (s2Cards.current[1] = el)}
              className={`${card} min-h-[15rem] md:row-span-2 md:min-h-0`}
              style={s2Reveal.getAnimStyle(1)}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              {/* text and button share one row, centred on each other */}
              <div className="absolute bottom-4 left-5 right-4 z-10 flex items-center justify-between gap-4 md:bottom-6 md:left-7 md:right-6">
                <p className="min-w-0 text-xs font-semibold leading-4 text-white md:text-sm md:leading-5">
                  Taking your parents to a new doctor?
                  <br />
                  Pick their language and city, we’ll list the clinics.
                </p>
                <Link
                  href={DIRECTORY}
                  className={`btn-fx btn-fx--green shrink-0 rounded-full bg-white px-5 py-3 text-base font-bold md:px-8 md:py-5 md:text-xl ${focusRing}`}
                >
                  <Roll>Search Clinics</Roll>
                </Link>
              </div>
            </MaskedCard>
            <MaskedCard
              bgImage={SECTION2_IMAGE}
              position={s2Pos[2]}
              natural={s2Img}
              focalX={s2Focal}
              cardRef={(el) => (s2Cards.current[2] = el)}
              className={`${card} min-h-[11.875rem] md:min-h-0`}
              style={s2Reveal.getAnimStyle(2)}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-transparent" />
              <p className="absolute left-5 top-4 z-10 text-[clamp(2.4rem,5.5vw,5rem)] font-bold leading-[0.98] text-white md:left-7 md:top-6">
                <span lang="vi">Tiếng Việt</span>
                <br />
                <span lang="ko">한국어</span> · <span lang="zh">中文</span>
              </p>
            </MaskedCard>
          </div>
        </section>

        {/* ================= 3. Top clinics ================= */}
        <section ref={(el) => sClinics.attach(el)} className={`${section} md:h-screen`}>
          <div className="grid h-full grid-cols-1 gap-2 md:grid-cols-4 md:grid-rows-[0.9fr_1.1fr] md:gap-3">
            <div
              className="flex min-h-[12.5rem] flex-col justify-between rounded-xl bg-stone-50 p-5 md:col-span-2 md:rounded-2xl md:p-7"
              style={sClinics.getAnimStyle(0)}
            >
              <h2 className="text-[clamp(2.75rem,6.5vw,6.5rem)] font-bold leading-[0.92] tracking-tight">
                Top-rated
                <br />
                clinics
              </h2>
              <p className="text-xs font-semibold md:text-sm">Highly reviewed, with Vietnamese, Korean or Chinese-speaking staff</p>
            </div>
            <Link
              href={DIRECTORY}
              className={`group flex min-h-[12.5rem] flex-col justify-between rounded-xl bg-[#024E44] p-5 text-white md:col-span-2 md:rounded-2xl md:p-7 ${focusRing}`}
              style={sClinics.getAnimStyle(1)}
            >
              <p className="text-xs font-semibold md:text-sm">The whole directory</p>
              <div className="flex items-end justify-between">
                <span className="text-[clamp(4rem,10vw,10rem)] font-bold leading-[0.8] tabular-nums">{counts.total}</span>
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white transition group-hover:bg-white group-hover:text-[#024E44] md:h-16 md:w-16">
                  <Arrow />
                </span>
              </div>
            </Link>
            {data.clinics.map((c, i) => (
              <Link
                key={c.id}
                href={clinicHref(c.slug)}
                className={`${card} group min-h-[20rem] md:min-h-0 ${focusRing}`}
                style={sClinics.getAnimStyle(2 + i)}
              >
                <SiteImg src={c.image} fallback={c.fallback} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold backdrop-blur-md">{c.specialty}</span>
                <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-white/20 p-3 text-white backdrop-blur-xl md:rounded-2xl md:p-4">
                  <h3 className="text-lg font-bold leading-tight md:text-xl">{c.name}</h3>
                  <p className="mt-1 text-xs font-semibold opacity-90">
                    {c.place}
                    {c.rating && ` · ★ ${c.rating} (${c.reviews.toLocaleString('en-US')})`}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1">
                    {c.langs.map((l) => (
                      <span key={l} className="rounded-full border border-white/70 px-2 py-0.5 text-xs font-semibold">{l}</span>
                    ))}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ================= 4. Specialties ================= */}
        <section ref={(el) => sSpecs.attach(el)} className={`${section} md:h-screen`}>
          <div className="grid h-full grid-cols-2 gap-2 md:grid-cols-5 md:grid-rows-[1.1fr_1fr_1fr] md:gap-3">
            <div
              className="relative isolate col-span-2 flex min-h-[10rem] flex-col justify-between overflow-hidden rounded-xl bg-zinc-200 p-5 md:col-span-5 md:flex-row md:items-end md:rounded-2xl md:p-7"
              style={sSpecs.getAnimStyle(0)}
            >
              {/* every specialty's icon, large and faint, drifting slowly across the empty top of the tile */}
              <div className="site-spec-drift pointer-events-none absolute inset-x-0 top-[8%] -z-10 flex w-max text-[#0D1F1C] opacity-[0.08]" aria-hidden="true">
                {[0, 1].map((copy) => (
                  <div key={copy} className="flex shrink-0 items-center gap-[clamp(2.5rem,5vw,5rem)] pr-[clamp(2.5rem,5vw,5rem)]">
                    {[...Object.values(SPEC_INFO).map((v) => v.icon), Video].map((I, k) => (
                      <I key={k} className="h-[clamp(5rem,11vw,10rem)] w-auto" strokeWidth={1.1} />
                    ))}
                  </div>
                ))}
              </div>
              <h2 className="text-[clamp(2.75rem,7vw,7rem)] font-bold leading-[0.9] tracking-tight">Specialties</h2>
              <p className="max-w-xs text-xs font-semibold md:text-right md:text-sm">Nine kinds of care, plus telehealth, each with clinics that speak your language</p>
            </div>
            {data.specialties.map((s, i) => {
              const info = SPEC_INFO[s.name] ?? { icon: Stethoscope, blurb: 'Clinics that speak your language' };
              const Icon = info.icon;
              const dark = i === 0;
              // checkerboard of mint and cream across the 5-column grid
              const tone = dark ? 'bg-[#024E44] text-white' : (i + Math.floor(i / 5)) % 2 ? 'bg-[#FBF4EC]' : 'bg-[#E3F1EC]';
              return (
                <Link
                  key={s.name}
                  href={s.href}
                  className={`group relative isolate flex min-h-[10.625rem] flex-col justify-between overflow-hidden rounded-xl p-4 md:min-h-0 md:rounded-2xl md:p-5 ${focusRing} ${tone}`}
                  style={sSpecs.getAnimStyle(1 + (i % 5))}
                >
                  {/* the same icon, oversized and faint, bleeding off the tile's right edge */}
                  <Icon
                    className={`pointer-events-none absolute -top-[10%] right-0 -z-10 h-[125%] w-auto translate-x-[34%] transition-transform duration-700 group-hover:-rotate-6 group-hover:scale-105 ${dark ? 'opacity-[0.12]' : 'opacity-[0.07]'}`}
                    strokeWidth={1}
                    aria-hidden="true"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <span className={`grid h-14 w-14 place-items-center rounded-full md:h-[4.5rem] md:w-[4.5rem] ${dark ? 'bg-white/10' : 'bg-white/70'}`}>
                      <Icon className="h-7 w-7 md:h-9 md:w-9" strokeWidth={1.6} aria-hidden="true" />
                    </span>
                    <ArrowUpRight className="h-5 w-5 opacity-50 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold leading-[1.05] md:text-2xl">{s.name}</h3>
                    <p className="mt-1 text-xs font-medium opacity-70 md:text-sm">{info.blurb}</p>
                    <p className="mt-3 flex items-baseline gap-2">
                      <span className="text-[clamp(2.2rem,3.6vw,3.75rem)] font-bold leading-none tracking-tight">{s.count}</span>
                      <span className="text-xs font-semibold opacity-70 md:text-sm">clinics</span>
                    </p>
                  </div>
                </Link>
              );
            })}
            <Link
              href={`${DIRECTORY}?telehealth=true`}
              className={`group relative isolate flex min-h-[10.625rem] flex-col justify-between overflow-hidden rounded-xl bg-[#0D1F1C] p-4 text-white md:min-h-0 md:rounded-2xl md:p-5 ${focusRing}`}
              style={sSpecs.getAnimStyle(5)}
            >
              <Video
                className="pointer-events-none absolute -top-[10%] right-0 -z-10 h-[125%] w-auto translate-x-[34%] opacity-[0.12] transition-transform duration-700 group-hover:-rotate-6 group-hover:scale-105"
                strokeWidth={1}
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 md:h-[4.5rem] md:w-[4.5rem]">
                  <Video className="h-7 w-7 md:h-9 md:w-9" strokeWidth={1.6} aria-hidden="true" />
                </span>
                <ArrowUpRight className="h-5 w-5 opacity-50 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xl font-bold leading-[1.05] md:text-2xl">Telehealth</h3>
                <p className="mt-1 text-xs font-medium opacity-70 md:text-sm">Video visits from home, in your language</p>
              </div>
            </Link>
          </div>
        </section>

        {/* ================= 5. How it works ================= */}
        <section ref={(el) => sSteps.attach(el)} className={`${section} md:h-screen`}>
          <div className="grid h-full grid-cols-1 gap-2 md:grid-cols-3 md:gap-3">
            {STEPS.map((s, i) => (
              <div
                key={s.title}
                className={`${card} flex min-h-[28.75rem] flex-col md:min-h-0 ${i === 1 ? 'bg-zinc-200' : 'bg-stone-50'}`}
                style={sSteps.getAnimStyle(i)}
              >
                <div className="p-5 md:p-7">
                  <span className="block text-[clamp(5rem,11vw,11rem)] font-bold leading-[0.8] tracking-tight tabular-nums">
                    0{i + 1}
                  </span>
                  <h3 className="mt-4 text-2xl font-bold md:text-3xl">{s.title}</h3>
                  <p className="mt-2 max-w-[34ch] text-sm font-medium opacity-80">{s.text}</p>
                </div>
                <div className="mx-2 mb-2 mt-auto min-h-[11.25rem] flex-1 overflow-hidden rounded-xl md:mx-3 md:mb-3 md:rounded-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stepPhotos[i]} alt="" className="h-full w-full object-cover" loading="lazy" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ================= 6. Cities ================= */}
        <section ref={(el) => sCities.attach(el)} className={`${section} md:h-screen`}>
          <div className="grid h-full grid-cols-2 gap-2 md:grid-cols-4 md:grid-rows-4 md:gap-3">
            <div
              className="col-span-2 flex min-h-[10rem] flex-col justify-between rounded-xl bg-[#0D1F1C] p-5 text-white md:row-span-2 md:rounded-2xl md:p-7"
              style={sCities.getAnimStyle(0)}
            >
              <h2 className="text-[clamp(2.75rem,6.5vw,6.5rem)] font-bold leading-[0.9] tracking-tight">
                Find care
                <br />
                near you
              </h2>
              <p className="text-xs font-semibold opacity-80 md:text-sm">{data.cities.length} metro areas with five or more listed clinics</p>
            </div>
            {data.cities.map((c, i) => {
              const max = data.cities[0]?.count || c.count;
              // checkerboard of mint and warm cream so the grid reads as a pattern, not empty boxes
              const row = Math.floor((i + 2) / 4);
              const tone = (i + row) % 2 === 0 ? 'bg-[#E3F1EC]' : 'bg-[#FBF4EC]';
              return (
                <Link
                  key={`${c.name}-${c.state}`}
                  href={c.href}
                  className={`group relative isolate flex min-h-[9.375rem] flex-col justify-between overflow-hidden rounded-xl ${tone} p-4 md:min-h-0 md:rounded-2xl md:p-5 ${focusRing}`}
                  style={sCities.getAnimStyle(1 + (i % 4))}
                >
                  {STATE_SHAPES[c.state] && (
                    // the state's silhouette, oversized and faint, behind the numbers
                    <svg
                      viewBox="0 0 100 100"
                      className="pointer-events-none absolute -bottom-[28%] -right-[14%] -z-10 h-[150%] w-auto text-[#024E44] opacity-[0.09] transition-transform duration-700 group-hover:scale-105"
                      aria-hidden="true"
                    >
                      <path d={STATE_SHAPES[c.state]} fill="currentColor" />
                    </svg>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-bold leading-tight md:text-2xl">
                      {c.name}
                      <span className="block text-xs font-semibold opacity-60 md:text-sm">{c.state}</span>
                    </h3>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#0D1F1C]/20 text-sm transition group-hover:bg-[#0D1F1C] group-hover:text-white">↗</span>
                  </div>
                  <div>
                    <p className="flex items-baseline gap-2">
                      <span className="text-[clamp(2.4rem,4.6vw,4.75rem)] font-bold leading-none tracking-tight">{c.count}</span>
                      <span className="text-xs font-semibold opacity-70 md:text-sm">clinics</span>
                    </p>
                    <span className="mt-3 block h-1 w-full overflow-hidden rounded-full bg-[#0D1F1C]/10" aria-hidden="true">
                      <span className="block h-full rounded-full bg-[#024E44]" style={{ width: `${Math.max(8, (c.count / max) * 100)}%` }} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ================= 7. Guides + clinics ================= */}
        <section ref={(el) => sGuides.attach(el)} className={`${section} flex min-h-screen flex-col overflow-hidden md:h-screen`}>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
            <div className="flex flex-col gap-2 md:gap-3">
              <div className="flex min-h-[11.25rem] flex-[1.2] flex-col justify-between rounded-xl bg-[#FBF4EC] p-5 md:min-h-0 md:rounded-2xl md:p-7" style={sGuides.getAnimStyle(0)}>
                <h2 className="text-[clamp(3rem,7vw,6.5rem)] font-bold leading-[0.95]">
                  Health
                  <br />
                  Guides
                </h2>
                <p className="text-xs font-semibold text-[#B5521F] md:text-sm">Written for Vietnamese, Korean and Chinese American families</p>
              </div>
              <div className="flex min-h-[8.75rem] flex-1 gap-2 md:min-h-0 md:gap-3" style={sGuides.getAnimStyle(1)}>
                <div className="flex-1 overflow-hidden rounded-xl md:rounded-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={SECTION3_IMG1} alt="" className="h-full w-full object-cover" loading="lazy" />
                </div>
                <div className="flex-1 overflow-hidden rounded-xl md:rounded-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={SECTION3_IMG2} alt="" className="h-full w-full object-cover" loading="lazy" />
                </div>
              </div>
              <div className="flex min-h-[10rem] flex-[0.8] items-end justify-between gap-4 rounded-xl bg-[#E3F1EC] p-5 md:min-h-0 md:rounded-2xl md:p-7" style={sGuides.getAnimStyle(2)}>
                <div>
                  <p className="mb-2 text-xs font-semibold text-[#024E44] md:mb-3 md:text-sm">For clinics</p>
                  <h3 className="text-xl font-bold leading-6 md:text-3xl md:leading-8">
                    Claim
                    <br />
                    Your Free
                    <br />
                    Profile
                  </h3>
                </div>
                <Link href="/claim" className={`btn-fx shrink-0 rounded-full bg-[#024E44] px-5 py-3 text-base font-bold text-white md:px-8 md:py-5 md:text-xl ${focusRing}`}>
                  <Roll>Claim Now</Roll>
                </Link>
              </div>
            </div>
            <div className={`${card} min-h-[27.5rem] md:min-h-0`} style={sGuides.getAnimStyle(3)}>
              {/* lifted so the grandmother's face sits above the two guide cards (the wall above their heads gives the room) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SECTION3_BG} alt="A grandmother and her two granddaughters smiling together" className="absolute inset-x-0 top-0 h-[120%] w-full -translate-y-[16.5%] object-cover object-[50%_80%]" loading="lazy" />
              <div className="absolute bottom-3 left-3 right-3 flex gap-2 md:bottom-5 md:left-5 md:right-5 md:gap-3">
                {guideCards.map((g, i) => (
                  <Link
                    key={g.slug}
                    href={`/insights/${g.slug}`}
                    className={`group flex h-40 flex-1 flex-col justify-between rounded-xl p-3 md:h-56 md:rounded-2xl md:p-5 ${focusRing} ${
                      i === 0 ? 'bg-white' : 'bg-black/30 text-white backdrop-blur-xl'
                    }`}
                  >
                    <h4 className="line-clamp-4 text-base font-bold leading-5 md:text-xl md:leading-7">{g.title}</h4>
                    <span
                      className={`flex h-9 w-9 items-center justify-center self-end rounded-full border transition md:h-12 md:w-12 ${
                        i === 0 ? 'border-[#0D1F1C] group-hover:bg-[#0D1F1C] group-hover:text-white' : 'border-white group-hover:bg-white group-hover:text-[#0D1F1C]'
                      }`}
                    >
                      <Arrow />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
