// Server-safe building blocks for the content pages in the site's mosaic language (design option A):
// rounded tiles in a tight white gutter, big tight sans headings, small semibold captions, pill buttons.
import Link from 'next/link';
import type { ReactNode } from 'react';

export const INK = '#0D1F1C';
export const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#024E44]';
/** tile corner radius and inner padding */
export const tile = 'rounded-xl md:rounded-2xl';
export const pad = 'p-5 md:p-7';
/** tile tones used across the site */
export const TONE = {
  stone: 'bg-stone-50',
  zinc: 'bg-zinc-200',
  mint: 'bg-[#E3F1EC]',
  cream: 'bg-[#FBF4EC]',
  green: 'bg-[#024E44] text-white',
  ink: 'bg-[#0D1F1C] text-white',
} as const;
export type Tone = keyof typeof TONE;

/** page frame: clears the floating menu, then the white gutter every tile sits in */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`site-a bg-white px-3 pb-1.5 pt-20 md:px-5 md:pb-2 md:pt-[5.375rem] ${className}`} style={{ color: INK }}>
      <div className="flex flex-col gap-2 md:gap-3">{children}</div>
    </div>
  );
}

/** a row of tiles */
export function Grid({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={`grid grid-cols-1 gap-2 md:gap-3 ${className}`}>{children}</div>;
}

export function Tile({
  children,
  tone = 'stone',
  className = '',
  as: As = 'div',
  id,
}: {
  children: ReactNode;
  tone?: Tone | 'none';
  className?: string;
  as?: 'div' | 'section' | 'header' | 'article' | 'aside';
  id?: string;
}) {
  return (
    <As id={id} className={`relative overflow-hidden ${tile} ${tone === 'none' ? '' : TONE[tone]} ${className}`}>
      {children}
    </As>
  );
}

/** a photo that fills its tile */
export function PhotoTile({ src, alt, className = '', eager }: { src: string; alt: string; className?: string; eager?: boolean }) {
  return (
    <div className={`${className.includes('absolute') ? '' : 'relative'} overflow-hidden ${tile} bg-stone-100 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" loading={eager ? 'eager' : 'lazy'} />
    </div>
  );
}

/** the oversized page or section title */
export function Display({
  children,
  as: As = 'h2',
  className = '',
  size = 'text-[clamp(2.75rem,6.5vw,6.5rem)]',
}: {
  children: ReactNode;
  as?: 'h1' | 'h2';
  className?: string;
  size?: string;
}) {
  return <As className={`${size} font-bold leading-[0.92] tracking-tight ${className}`}>{children}</As>;
}

/** smaller tile heading */
export function Heading({ children, as: As = 'h3', className = '' }: { children: ReactNode; as?: 'h2' | 'h3' | 'h4'; className?: string }) {
  return <As className={`text-2xl font-bold leading-tight tracking-tight md:text-3xl ${className}`}>{children}</As>;
}

/** small semibold line under or above a heading */
export function Caption({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold md:text-sm ${className}`}>{children}</p>;
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold uppercase tracking-widest opacity-55 ${className}`}>{children}</p>;
}

/** a button label that rolls up on hover, an identical copy taking its place (needs .btn-fx on the button) */
export function Roll({ children }: { children: ReactNode }) {
  return (
    <span className="fx-roll">
      <span>{children}</span>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}

/** button looks; the second value is the hover fill (see .btn-fx in site.css) */
const PILL = {
  white: 'bg-white text-[#0D1F1C] btn-fx--green',
  green: 'bg-[#024E44] text-white',
  ink: 'bg-[#0D1F1C] text-white btn-fx--green',
  line: 'border border-current btn-fx--green',
} as const;

/** the site's button: a pill that grows slightly on hover */
export function Pill({
  href,
  children,
  variant = 'green',
  onDark = false,
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof PILL;
  /** an outline pill on a dark tile fills white instead of green */
  onDark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`btn-fx inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold md:px-7 md:py-4 md:text-base ${PILL[variant]} ${onDark ? 'btn-fx--white' : ''} ${ring} ${className}`}
    >
      <Roll>{children}</Roll>
    </Link>
  );
}

export function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`rotate-[-45deg] ${className}`} aria-hidden="true">
      <path d="M1 7h12m0 0L8 2m5 5L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** the round arrow button at the corner of a linked tile; fills in when the tile is hovered (needs `group` on the tile) */
export function ArrowCircle({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition md:h-12 md:w-12 ${
        light ? 'border-white group-hover:bg-white group-hover:text-[#0D1F1C]' : 'border-[#0D1F1C] group-hover:bg-[#0D1F1C] group-hover:text-white'
      } ${className}`}
    >
      <ArrowIcon />
    </span>
  );
}
