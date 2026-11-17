// Frame for the provider sign-in screens: a photo tile with a short promise beside the form on a white tile.
import type { ReactNode } from 'react';
import { Page, Tile, pad, tile } from './ui';

export function AuthFrame({ title, caption, children }: { title: ReactNode; caption: string; children: ReactNode }) {
  return (
    <Page>
      <div className="grid min-h-[calc(100svh-7.75rem)] grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
        <div className={`relative hidden min-h-[30rem] overflow-hidden md:block ${tile}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/photos/a2-section2.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 text-white md:bottom-8 md:left-8 md:right-8">
            <p className="text-xs font-semibold opacity-90 md:text-sm">{caption}</p>
            <p className="mt-3 max-w-[14ch] text-[clamp(2.5rem,5vw,5rem)] font-bold leading-[0.92] tracking-tight">{title}</p>
          </div>
        </div>
        <Tile tone="none" className={`flex items-center bg-white ring-1 ring-[#0D1F1C]/[0.06] ${pad} py-12 md:py-16`}>
          {children}
        </Tile>
      </div>
    </Page>
  );
}
