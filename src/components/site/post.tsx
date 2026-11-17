// Shared top of a long-read page (Health Guides articles, Pulse issues), laid out like the clinic profile:
// breadcrumb, large title, one meta line and actions on the page itself; then the photo beside a mint
// "at a glance" card. The reading column and its sidebar follow on the page.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { SiteImg } from './img';
import { INK } from './ui';

/** same width and gutter as the clinic profile */
export const postWrap = 'mx-auto w-full max-w-[90rem] px-3 md:px-5';

export function PostPage({ children }: { children: ReactNode }) {
  return (
    <div className="site-a bg-white pb-10 pt-20 md:pb-16 md:pt-[5.375rem]" style={{ color: INK }}>
      {children}
    </div>
  );
}

export function PostHeader({
  crumbs,
  title,
  meta,
  actions,
  image,
  fallback,
  imageAlt,
  glanceTitle = 'At a glance',
  glance,
}: {
  crumbs: { label: string; href?: string }[];
  title: string;
  meta: string[];
  actions?: ReactNode;
  image: string | null;
  fallback: string;
  imageAlt: string;
  glanceTitle?: string;
  glance: { label: string; value: ReactNode }[];
}) {
  return (
    <>
      <header className={`${postWrap} pb-6 pt-4 md:pb-8 md:pt-8`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-semibold opacity-60">
          {crumbs.map((c, i) => (
            <span key={c.label} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
              {c.href ? (
                <Link href={c.href} className="hover:underline">{c.label}</Link>
              ) : (
                <span>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="max-w-[24ch] text-[clamp(2.25rem,4.2vw,4rem)] font-bold leading-[1] tracking-tight">{title}</h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold opacity-70 md:text-base">
              {meta.filter(Boolean).map((m) => (
                <span key={m}>{m}</span>
              ))}
            </p>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      </header>

      <div className={`${postWrap} grid gap-2 md:grid-cols-3 md:gap-3`}>
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-stone-100 md:col-span-2 md:aspect-auto md:min-h-[28rem] md:rounded-2xl">
          <SiteImg src={image} fallback={fallback} alt={imageAlt} eager className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <div className="flex flex-col rounded-xl bg-[#E3F1EC] p-5 md:rounded-2xl md:p-7">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-60">{glanceTitle}</p>
          <dl className="mt-4 flex flex-1 flex-col divide-y divide-[#0D1F1C]/10">
            {glance.map((g) => (
              <div key={g.label} className="py-4 first:pt-0 last:pb-0">
                <dt className="text-xs font-semibold opacity-60">{g.label}</dt>
                <dd className="mt-1 text-base font-bold">{g.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </>
  );
}
