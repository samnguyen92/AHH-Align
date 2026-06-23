import Link from 'next/link';
import { NewsletterForm } from './newsletter-form';
import { BrandLogo } from './brand-logo';

const socialLinks = [
  {
    href: '#x',
    label: 'X',
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2H21.6l-7.33 8.38L22.9 22h-6.754l-5.29-6.918L4.8 22H1.443l7.84-8.96L1 2h6.925l4.782 6.324L18.244 2Zm-1.178 17.953h1.86L6.914 3.94H4.92l12.146 16.013Z" />
      </svg>
    ),
  },
  {
    href: '#linkedin',
    label: 'LinkedIn',
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <path d="M20.447 20.452h-3.554v-5.568c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.447-2.136 2.942v5.663H9.351V9h3.414v1.561h.049c.476-.9 1.637-1.852 3.368-1.852 3.601 0 4.267 2.371 4.267 5.455v6.288ZM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124ZM7.115 20.452H3.556V9h3.559v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.226.792 24 1.771 24h20.451C23.2 24 24 23.226 24 22.271V1.729C24 .774 23.2 0 22.225 0Z" />
      </svg>
    ),
  },
  {
    href: '#facebook',
    label: 'Facebook',
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.438H7.078v-3.489h3.047V9.414c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97H15.83c-1.491 0-1.956.931-1.956 1.887v2.263h3.328l-.532 3.489h-2.796V24C19.612 23.094 24 18.1 24 12.073Z" />
      </svg>
    ),
  },
];

export function Footer() {
  return (
    <footer className="home-footer bg-[#92C7AD] px-[10px] pb-[10px] pt-[10px]">
      <section className="home-newsletter mx-auto flex min-h-[299px] w-full max-w-[1420px] items-center rounded-[16px] bg-white px-5 py-12 sm:px-10 lg:px-20">
        <div className="brand-container">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h3 className="text-[32px] font-medium leading-tight text-[var(--ahh-ink)]">Subscribe to AHH Pulse</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ahh-muted)]">
                Monthly health insights, directory updates, and community resources.
              </p>
            </div>
            <NewsletterForm />
          </div>
        </div>
      </section>

      <section
        className="home-footer-panel relative isolate mx-auto mt-[10px] min-h-[520px] w-full max-w-[1420px] overflow-hidden rounded-[16px] px-5 py-10 sm:px-10 lg:min-h-[560px] lg:px-20"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="brand-container relative z-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute opacity-95"
            style={{
              left: '50%',
              bottom: '-40px',
              width: 'min(92vw, 1560px)',
              maxWidth: '100%',
              zIndex: -1,
              transform: 'translateX(-50%)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/asian-footer-bg.svg" alt="" className="h-auto w-full" />
          </div>

          <div className="footer-link-grid pb-12">
            <div>
              <div className="mb-4">
                <BrandLogo />
              </div>
              <p className="mb-5 max-w-xs text-xs leading-relaxed text-[var(--ahh-muted)]">
                Connecting Vietnamese and Korean-speaking patients with trusted clinics across the United States.
              </p>
              <div className="flex items-center gap-3">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E5F0ED] text-[var(--ahh-deep-teal)] transition-colors hover:bg-[var(--ahh-lime)]"
                    aria-label={social.label}
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase text-[var(--ahh-deep-teal)]">Directory</h4>
              <ul className="space-y-2">
                {[
                  { href: '/search?groupBy=specialty', label: 'Browse by Specialty' },
                  { href: '/search?groupBy=city', label: 'Browse by City' },
                  { href: '/search?groupBy=language', label: 'Browse by Language' },
                  { href: '/search', label: 'View All Clinics' },
                ].map((link) => (
                  <li key={`directory-${link.label}-${link.href}`}>
                    <Link href={link.href} className="text-sm text-[var(--ahh-muted)] transition-colors hover:text-[var(--ahh-deep-teal)]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase text-[var(--ahh-deep-teal)]">Resources</h4>
              <ul className="space-y-2">
                {[
                  { href: '/insights', label: 'Health Guide' },
                  { href: '/pulse', label: 'AHH Pulse' },
                  { href: '#faq', label: 'Patient FAQ' },
                  { href: '/claim', label: 'For Providers' },
                ].map((link) => (
                  <li key={`resources-${link.label}-${link.href}`}>
                    <Link href={link.href} className="text-sm text-[var(--ahh-muted)] transition-colors hover:text-[var(--ahh-deep-teal)]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase text-[var(--ahh-deep-teal)]">For Clinics</h4>
              <ul className="space-y-2">
                {[
                  { href: '/claim', label: 'Claim a Free Profile' },
                  { href: '/dashboard', label: 'Profile Management' },
                  { href: '/search', label: 'Clinic Directory' },
                  { href: '/claim', label: 'Contact Support' },
                ].map((link) => (
                  <li key={`clinics-${link.label}-${link.href}`}>
                    <Link href={link.href} className="text-sm text-[var(--ahh-muted)] transition-colors hover:text-[var(--ahh-deep-teal)]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase text-[var(--ahh-deep-teal)]">Company</h4>
              <ul className="space-y-2">
                {[
                  { href: '/about', label: 'About Us' },
                  { href: '/about#mission', label: 'Our Mission' },
                  { href: '/insights', label: 'Press' },
                  { href: '/claim', label: 'Contact' },
                ].map((link) => (
                  <li key={`company-${link.label}-${link.href}`}>
                    <Link href={link.href} className="text-sm text-[var(--ahh-muted)] transition-colors hover:text-[var(--ahh-deep-teal)]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative z-10 mt-8 flex flex-col gap-3 border-t border-[var(--ahh-border)] pt-5 text-xs text-[var(--ahh-muted)] sm:flex-row sm:items-center sm:justify-between lg:mt-16">
            <p>Brand Identity v1.0 · {new Date().getFullYear()}</p>
            <p>© {new Date().getFullYear()} Asian Health Hub. All rights reserved.</p>
          </div>
        </div>
      </section>
    </footer>
  );
}
