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

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-[#92C7AD] px-3 py-3 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 rounded-[var(--ahh-radius-sm)] border border-[var(--ahh-border)] bg-white/95 px-4 shadow-[0_10px_30px_rgba(0,92,75,0.08)]">
        <BrandLogo compact />

        {/* Desktop Nav */}
        <nav className="hidden min-w-0 items-center gap-5 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-1 text-sm font-semibold text-[var(--ahh-muted)] transition-colors hover:text-[var(--ahh-deep-teal)]"
            >
              {link.label}
            </Link>
          ))}
          <span className="h-6 w-px bg-[var(--ahh-border)]" />
          <Link
            href="/claim"
            className="text-sm font-semibold text-[var(--ahh-muted)] transition-colors hover:text-[var(--ahh-deep-teal)]"
          >
            Claim a Free Profile
          </Link>
        </nav>

        {/* Right Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Language */}
          <button className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--ahh-muted)] transition-colors hover:bg-white hover:text-[var(--ahh-deep-teal)] md:flex">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            English
          </button>

          {/* Search CTA */}
          <Link
            href="/search"
            className="brand-button-secondary min-h-10 whitespace-nowrap px-5 py-2"
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
