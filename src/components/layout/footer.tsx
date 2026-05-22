import Link from 'next/link';
import { NewsletterForm } from './newsletter-form';
import { BrandLogo } from './brand-logo';

const socialLinks = [
  {
    href: '#facebook',
    label: 'Facebook',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M14 8.25V6.5c0-.74.57-1.25 1.38-1.25H17V2.2A22 22 0 0 0 14.6 2C12.22 2 10.6 3.45 10.6 6.1v2.15H8v3.4h2.6V22H14V11.65h2.75l.45-3.4H14Z" />
      </svg>
    ),
  },
  {
    href: '#instagram',
    label: 'Instagram',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="12" cy="12" r="3.2" />
        <circle cx="17" cy="7" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: '#linkedin',
    label: 'LinkedIn',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M6.94 8.98H3.62V20h3.32V8.98ZM5.28 7.48a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM20.38 13.95c0-3.22-1.72-5.3-4.52-5.3a3.86 3.86 0 0 0-3.5 1.93v-1.6H9.18V20h3.32v-5.45c0-1.44.27-2.84 2.06-2.84 1.76 0 1.78 1.65 1.78 2.93V20h3.32v-6.05h.72Z" />
      </svg>
    ),
  },
];

export function Footer() {
  return (
    <footer>
      {/* Newsletter Section */}
      <section className="bg-[var(--ahh-deep-teal)] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-bold text-white">Subscribe to AHH Pulse</h3>
            <p className="mt-1 text-sm text-white/70">
              Get tips on navigating healthcare, finding clinics, health insurance, health
              guidance, and community updates — delivered to your inbox.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </section>

      {/* Footer Links */}
      <section className="bg-[#07382f] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Brand */}
            <div>
              <div className="mb-3">
                <BrandLogo inverted />
              </div>
              <p className="mb-4 text-xs leading-relaxed text-white/62">
                Connecting Vietnamese and Korean-speaking patients with trusted clinics across the United States. Free to use. Always.
              </p>
              {/* Social Icons */}
              <div className="flex items-center gap-3">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/65 transition-colors hover:bg-[var(--ahh-lime)] hover:text-[var(--ahh-deep-teal)]"
                    aria-label={social.label}
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            </div>

            {/* Directory */}
            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase text-[var(--ahh-lime)]">Directory</h4>
              <ul className="space-y-2">
                {[
                  { href: '/search?groupBy=specialty', label: 'Browse by Specialty' },
                  { href: '/search?groupBy=city', label: 'Browse by City' },
                  { href: '/search?groupBy=language', label: 'Browse by Language' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-white/62 transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase text-[var(--ahh-lime)]">Resources</h4>
              <ul className="space-y-2">
                {[
                  { href: '/insights', label: 'Insights & Guides' },
                  { href: '/pulse', label: 'AHH Pulse' },
                  { href: '#about', label: 'About Us' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-white/62 transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* For Clinic + Legal */}
            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase text-[var(--ahh-lime)]">For Clinic</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/claim" className="text-sm text-white/62 transition-colors hover:text-white">
                    Claim a Free Profile
                  </Link>
                </li>
              </ul>

              <h4 className="mb-3 mt-6 text-xs font-extrabold uppercase text-[var(--ahh-lime)]">Legal</h4>
              <ul className="space-y-2">
                {[
                  { href: '/privacy', label: 'Privacy Policy' },
                  { href: '/terms', label: 'Terms of Use' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-white/62 transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-center text-xs text-white/48">
              © {new Date().getFullYear()} Asian Health Hub. Not a medical provider. Always consult a licensed healthcare professional.
            </p>
          </div>
        </div>
      </section>
    </footer>
  );
}
