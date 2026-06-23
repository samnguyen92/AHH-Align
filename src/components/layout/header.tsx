import Link from 'next/link';
import { MobileNav } from './mobile-nav';
import { BrandLogo } from './brand-logo';

interface NavLink {
  href: string;
  label: string;
  hasDropdown?: boolean;
}

const navLinks: NavLink[] = [
  { href: '/search', label: 'Directory' },
  { href: '/insights', label: 'Insights' },
  { href: '/pulse', label: 'Pulse' },
  { href: '/about', label: 'About' },
];

export function Header({ variant = 'default' }: { variant?: 'default' | 'overlay' | 'home' }) {
  const isOverlay = variant === 'overlay';
  const isHome = variant === 'home';

  return (
    <header
      className={[
        'z-50 w-full px-3 py-3 md:px-5 md:py-4',
        isHome
          ? 'absolute left-0 top-0 bg-transparent'
          : isOverlay
            ? 'fixed left-0 top-0 bg-transparent'
            : 'sticky top-0 bg-[#92C7AD]',
      ].join(' ')}
    >
      <div className="mx-auto grid h-[48px] w-full max-w-[1399px] grid-cols-[auto_auto] items-center justify-between gap-3 rounded-[12px] border border-white/80 bg-white/95 px-4 shadow-[0_20px_60px_rgba(2,78,68,0.18)] backdrop-blur md:h-[76px] md:rounded-[16px] md:px-8 lg:grid-cols-[220px_minmax(0,1fr)_260px] xl:grid-cols-[280px_minmax(0,1fr)_330px] xl:px-10">
        <BrandLogo />

        {/* Desktop Nav */}
        <nav className="hidden min-w-0 items-center justify-center gap-2 lg:flex xl:gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-[15px] font-normal text-neutral-700 transition-colors hover:bg-[var(--ahh-mist)] hover:text-[var(--ahh-deep-teal)] xl:px-4"
            >
              {link.label}
            </Link>
          ))}
          <span className="h-6 w-px bg-[var(--ahh-border)]" />
          <Link
            href="/claim"
            className="rounded-lg px-3 py-2 text-[15px] font-normal text-neutral-700 transition-colors hover:bg-[var(--ahh-mist)] hover:text-[var(--ahh-deep-teal)] xl:px-4"
          >
            Claim a Free Profile
          </Link>
        </nav>

        {/* Right Actions */}
        <div className="flex shrink-0 items-center justify-end gap-3">
          {/* Language */}
          <button className="hidden items-center gap-2 rounded-lg px-3 py-2 text-[15px] font-normal text-[var(--ahh-muted)] transition-colors hover:bg-[var(--ahh-mist)] hover:text-[var(--ahh-deep-teal)] md:flex">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            English
          </button>

          {/* Search CTA */}
          <Link
            href="/search"
            className="home-header-cta brand-button-secondary hidden min-h-[54px] whitespace-nowrap rounded-full px-7 py-3 text-base font-semibold lg:inline-flex"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            Find a Clinic
          </Link>

          <MobileNav links={navLinks} />
        </div>
      </div>
    </header>
  );
}
