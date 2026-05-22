import Link from 'next/link';
import { MobileNav } from './mobile-nav';
import { BrandLogo } from './brand-logo';

interface NavLink {
  href: string;
  label: string;
  hasDropdown?: boolean;
}

const navLinks: NavLink[] = [
  { href: '/search', label: 'Directory', hasDropdown: true },
  { href: '/insights', label: 'Insights' },
  { href: '#faq', label: 'FAQ' },
  { href: '#about', label: 'About' },
  { href: '/claim', label: 'Claim Your Profile' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[rgba(0,92,75,0.1)] bg-[#f7fbf8]/90 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandLogo />

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-[var(--ahh-muted)] transition-colors hover:bg-white hover:text-[var(--ahh-deep-teal)]"
            >
              {link.label}
              {link.hasDropdown && (
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              )}
            </Link>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Language */}
          <button className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--ahh-muted)] transition-colors hover:bg-white hover:text-[var(--ahh-deep-teal)] md:flex">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            EN
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>

          {/* Search CTA */}
          <Link
            href="/search"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ahh-lime)] px-4 py-2 text-sm font-bold text-[var(--ahh-deep-teal)] transition-colors hover:bg-[var(--ahh-soft-yellow)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            Search
          </Link>

          <Link
            href="/dashboard"
            className="hidden items-center gap-1.5 rounded-full border border-[rgba(0,92,75,0.14)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ahh-deep-teal)] transition-colors hover:bg-[var(--ahh-mist)] sm:inline-flex"
          >
            Dashboard
          </Link>

          <MobileNav links={navLinks} />
        </div>
      </div>
    </header>
  );
}
