// Site footer: link columns, disclaimer, then the full-width wordmark cropped through "asian" (reveals on hover).
import Link from 'next/link';
import { FloatingSearch } from './floating-search';
import { Roll } from './ui';
import './site.css';

const COLUMNS: [string, [string, string][]][] = [
  ['Directory', [['All clinics', '/search'], ['Vietnamese', '/search?language=Vietnamese'], ['Korean', '/search?language=Korean'], ['Chinese', '/search?language=Chinese']]],
  ['Learn', [['Health Guides', '/insights'], ['AHH Pulse', '/pulse'], ['About', '/about']]],
  ['For clinics', [['Claim a profile', '/claim'], ['Provider dashboard', '/dashboard']]],
];

export function SiteFooter() {
  const logo = '/brand/ahh-logo-2026-white.svg';
  return (
    <>
    <FloatingSearch />
    <footer className="site-foot">
      <div className="site-foot-card">
        <div className="site-foot-grid">
          <div>
            <p className="site-foot-greet">
              <span lang="vi">Xin chào</span> · <span lang="ko">안녕하세요</span> · <span lang="zh">您好</span>
            </p>
            <Link href="/search" className="site-foot-cta btn-fx btn-fx--green">
              <Roll>Find a Clinic</Roll>
            </Link>
          </div>
          {COLUMNS.map(([h, links]) => (
            <div key={h}>
              <h4 className="site-foot-h">{h}</h4>
              <ul>
                {links.map(([l, href]) => (
                  <li key={l}>
                    <Link href={href} className="site-foot-link">{l}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="site-foot-legal">
          Educational, not medical advice. Always confirm services, language support and insurance directly with the clinic.
        </p>
        {/* Full-width wordmark, cropped to the top half of "asian" and bleeding off the bottom edge. */}
        <div className="site-foot-word" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width="180" height="86" />
        </div>
      </div>
    </footer>
    </>
  );
}
