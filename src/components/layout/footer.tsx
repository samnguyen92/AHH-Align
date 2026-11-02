import Link from 'next/link';
import { NewsletterForm } from './newsletter-form';

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
            <div className="lg-footer-socials">
              {socialLinks.map((social) => (
                <a key={social.label} href={social.href} aria-label={social.label}>
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

          <div className="lg-footer-col">
            <h4>Specialties</h4>
            <ul>
              {[
                { href: '/search?specialty=Primary%20Care', label: 'Primary Care' },
                { href: '/search?specialty=Dental', label: 'Dental Care' },
                { href: '/search?specialty=Pediatrics', label: 'Pediatrics' },
                { href: '/search?specialty=OB%2FGYN', label: 'Women’s Health' },
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
