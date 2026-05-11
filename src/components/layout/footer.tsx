import Link from 'next/link';
import { NewsletterForm } from './newsletter-form';

export function Footer() {
  return (
    <footer>
      {/* Newsletter Section */}
      <section className="bg-gray-900 py-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold text-white">Subscribe to AHH Pulse</h3>
            <p className="text-sm text-gray-400 mt-1">
              Get tips on navigating healthcare, finding clinics, health insurance, health
              guidance, and community updates — delivered to your inbox.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </section>

      {/* Footer Links */}
      <section className="bg-gray-950 py-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Brand */}
            <div>
              <Link href="/" className="flex items-center gap-2 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue-light)" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                <span className="text-sm font-bold tracking-tight uppercase text-white">
                  Asian Health Hub
                </span>
              </Link>
              <p className="text-xs text-gray-400 leading-relaxed mb-4">
                Connecting Vietnamese and Korean-speaking patients with trusted clinics across the United States. Free to use. Always.
              </p>
              {/* Social Icons */}
              <div className="flex items-center gap-3">
                {['facebook', 'instagram', 'linkedin'].map((social) => (
                  <a
                    key={social}
                    href={`#${social}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    aria-label={social}
                  >
                    <span className="text-xs font-bold uppercase">{social[0]}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Directory */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">DIRECTORY</h4>
              <ul className="space-y-2">
                {[
                  { href: '/search?groupBy=specialty', label: 'Browse by Specialty' },
                  { href: '/search?groupBy=city', label: 'Browse by City' },
                  { href: '/search?groupBy=language', label: 'Browse by Language' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">RESOURCES</h4>
              <ul className="space-y-2">
                {[
                  { href: '/insights', label: 'Insights & Guides' },
                  { href: '/pulse', label: 'AHH Pulse' },
                  { href: '#about', label: 'About Us' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* For Clinic + Legal */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">FOR CLINIC</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/claim" className="text-sm text-gray-400 hover:text-white transition-colors">
                    Claim a Free Profile
                  </Link>
                </li>
              </ul>

              <h4 className="text-sm font-semibold text-white mt-6 mb-3">LEGAL</h4>
              <ul className="space-y-2">
                {[
                  { href: '/privacy', label: 'Privacy Policy' },
                  { href: '/terms', label: 'Terms of Use' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-8 pt-6 border-t border-gray-800">
            <p className="text-xs text-gray-500 text-center">
              © {new Date().getFullYear()} Asian Health Hub. Not a medical provider. Always consult a licensed healthcare professional.
            </p>
          </div>
        </div>
      </section>
    </footer>
  );
}
