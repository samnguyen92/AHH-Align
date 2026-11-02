'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

const NAV = [
  { href: '/search', label: 'Directory' },
  { href: '/insights', label: 'Insights' },
  { href: '/pulse', label: 'Pulse' },
  { href: '/about', label: 'About' },
  { href: '/claim', label: 'Claim a Free Profile' },
];

const ARROW = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

/**
 * Longevity-style header: transparent over the hero, solid once scrolled,
 * hides while reading down and returns on scroll up, hover pill glides between items.
 */
export function LgHeader({ overHero }: { overHero: boolean }) {
  const pathname = usePathname();
  const [solid, setSolid] = useState(!overHero);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const last = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setSolid(!overHero || y > 24);
      setHidden(!open && y > last.current && y > 320);
      last.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overHero, open]);

  useEffect(() => setOpen(false), [pathname]);

  const isSolid = solid || open;

  return (
    <>
      <header className="lg-hdr" data-solid={isSolid ? 'true' : 'false'} data-hidden={hidden ? 'true' : 'false'}>
        <div className="lg-wrap">
          <Link href="/" className="lg-logo" aria-label="Asian Health Hub home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="light" src="/brand/ahh-logo-new-white.svg" alt="" width="88" height="42" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="dark" src="/brand/ahh-logo-new-dark.svg" alt="Asian Health Hub" width="88" height="42" />
          </Link>

          <nav className="lg-nav" aria-label="Main" onMouseLeave={() => setHover(null)}>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                onMouseEnter={() => setHover(item.href)}
                onFocus={() => setHover(item.href)}
              >
                {hover === item.href && (
                  <motion.span layoutId="lg-nav-pill" className="pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>{item.label}</span>
              </Link>
            ))}
          </nav>

          <Link href="/search" className="lg-cta lg-cta--hdr lg-cta--green">
            Find a Clinic
          </Link>

          <button
            type="button"
            className="lg-burger"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {open ? <path d="M5 5l12 12M17 5L5 17" /> : <path d="M3 7h16M3 15h16" />}
            </svg>
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="lg lg-sheet"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {NAV.map((item, i) => (
              <motion.div key={item.href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.1 }}>
                <Link href={item.href}>{item.label}</Link>
              </motion.div>
            ))}
            <Link href="/search" className="lg-cta lg-cta--green" style={{ marginTop: 24, fontSize: 15, padding: '0 22px', borderBottom: 0, display: 'inline-flex' }}>
              Find a Clinic {ARROW}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
