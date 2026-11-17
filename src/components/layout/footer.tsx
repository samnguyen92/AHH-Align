import Link from 'next/link';
import { NewsletterForm } from './newsletter-form';

// Social profiles: add real URLs here when the accounts exist, then render them in .lg-footer-brand.

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="lg-footer">
      <div className="lg-wrap">
        {/* Top Row: Newsletter Bar */}
        <div className="lg-footer-top">
          <div>
            <h3>Subscribe to AHH Pulse</h3>
            <p>Monthly health insights, directory updates, and culturally informed care guides.</p>
          </div>
          <NewsletterForm />
        </div>

        {/* Middle Row: 5-Column Directory & Navigation Grid */}
        <div className="lg-footer-grid">
          <div className="lg-footer-brand">
            <Link href="/" aria-label="Asian Health Hub home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/ahh-logo-new-white.svg" alt="Asian Health Hub" width="96" height="44" />
            </Link>
            <p>
              Connecting Vietnamese, Korean, and Chinese-speaking patients with trusted clinics across the United States.
            </p>
          </div>

          <div className="lg-footer-col">
            <h4>Specialties</h4>
            <ul>
              {[
                { href: '/search?specialty=Primary%20Care', label: 'Primary Care' },
                { href: '/search?specialty=Dental', label: 'Dental' },
                { href: '/search?specialty=Pediatrics', label: 'Pediatrics' },
                { href: '/search?specialty=OB%2FGYN', label: 'OB/GYN' },
                { href: '/search?specialty=Mental%20Health', label: 'Mental Health' },
              ].map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg-footer-col">
            <h4>Top Cities</h4>
            <ul>
              {[
                { href: '/search?city=Los%20Angeles', label: 'Los Angeles, CA' },
                { href: '/search?city=Houston', label: 'Houston, TX' },
                { href: '/search?city=San%20Jose', label: 'San Jose, CA' },
                { href: '/search?city=San%20Francisco', label: 'San Francisco, CA' },
                { href: '/search?city=Seattle', label: 'Seattle, WA' },
              ].map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg-footer-col">
            <h4>Resources</h4>
            <ul>
              {[
                { href: '/search', label: 'View All Clinics' },
                { href: '/insights', label: 'Health Guides' },
                { href: '/pulse', label: 'AHH Pulse' },
                { href: '/search?language=Vietnamese', label: 'Vietnamese Care' },
                { href: '/search?language=Korean', label: 'Korean Care' },
              ].map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg-footer-col">
            <h4>For Clinics &amp; Company</h4>
            <ul>
              {[
                { href: '/claim', label: 'Claim a Free Profile' },
                { href: '/dashboard', label: 'Provider Dashboard' },
                { href: '/about', label: 'About Asian Health Hub' },
                { href: '/about#mission', label: 'Our Mission' },
                { href: '/claim', label: 'Contact Support' },
              ].map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Row: Legal Disclaimer & Copyright (Longevity .legal style) */}
        <div className="lg-footer-legal">
          <p>
            Educational, not medical advice. Clinic details, pricing, and language availability are listed to help
            patients compare care options. Always confirm services, language support, and insurance coverage directly
            with the clinic before booking an appointment.
          </p>
          <div className="lg-footer-legal-row">
            <span>© {year} Asian Health Hub. All rights reserved.</span>
            <div className="lg-footer-legal-links">
              <Link href="/search">Directory</Link>
              <Link href="/insights">Insights</Link>
              <Link href="/about">About</Link>
              <Link href="/claim">Claim Profile</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
