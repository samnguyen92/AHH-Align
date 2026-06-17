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
  { href: '/insights#pulse', label: 'Pulse' },
  { href: '#about', label: 'About' },
];

export function Header({ variant = 'default' }: { variant?: 'default' | 'overlay' | 'home' }) {
  const isOverlay = variant === 'overlay';
  const isHome = variant === 'home';

  return (
    <header
      className={[
        'z-50 w-full px-[10px] py-[10px] ',
        isHome
          ? 'absolute left-0 top-0 bg-transparent'
          : isOverlay
            ? 'fixed left-0 top-0 bg-transparent'
            : 'sticky top-0 bg-[#92C7AD]',
      ].join(' ')}
    >
      <div className="mx-auto flex h-[42px] w-full max-w-[1399px] items-center justify-between gap-3 rounded-[4px] border border-white/70 bg-white/95 px-2 shadow-[0_18px_50px_rgba(2,78,68,0.14)] md:h-[62px] md:rounded-[12px] md:px-3 md:pl-8">
        <BrandLogo compact />

        {/* Desktop Nav */}
        <nav className="hidden min-w-0 items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3.5 py-2 text-sm font-normal text-neutral-700 transition-colors hover:bg-[var(--ahh-mist)] hover:text-[var(--ahh-deep-teal)]"
            >
              {link.label}
            </Link>
          ))}
          <span className="h-6 w-px bg-[var(--ahh-border)]" />
          <Link
            href="/claim"
            className="rounded-lg px-3.5 py-2 text-sm font-normal text-neutral-700 transition-colors hover:bg-[var(--ahh-mist)] hover:text-[var(--ahh-deep-teal)]"
          >
            Claim a Free Profile
          </Link>
        </nav>

        {/* Right Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Language */}
          <button className="hidden items-center gap-1 rounded-lg px-3 py-2 text-[13px] font-normal text-[var(--ahh-muted)] transition-colors hover:bg-[var(--ahh-mist)] hover:text-[var(--ahh-deep-teal)] md:flex">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            English
          </button>

          {/* Search CTA */}
          <Link
            href="/search"
            className="home-header-cta brand-button-secondary hidden min-h-[38px] whitespace-nowrap px-5 py-2 text-sm font-medium lg:inline-flex"
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
