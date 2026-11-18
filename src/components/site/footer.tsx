'use client';

// Site footer: link columns, disclaimer, then the full-width wordmark cropped through "asian" (reveals on hover).
import Link from 'next/link';
import { FloatingSearch } from './floating-search';
import { Roll } from './ui';
import { LanguageSwitcher, useLocale } from '@/lib/i18n/context';
import './site.css';

export function SiteFooter() {
  const { t } = useLocale();
  const logo = '/brand/ahh-logo-2026-white.svg';
  const columns: [string, [string, string][]][] = [
    [
      t.footer.directory,
      [
        [t.footer.allClinics, '/search'],
        [t.footer.vietnamese, '/search?language=Vietnamese'],
        [t.footer.korean, '/search?language=Korean'],
        [t.footer.chinese, '/search?language=Chinese'],
      ],
    ],
    [
      t.footer.learn,
      [
        [t.footer.healthGuides, '/insights'],
        [t.footer.ahhPulse, '/pulse'],
        [t.footer.about, '/about'],
      ],
    ],
    [
      t.footer.forClinics,
      [
        [t.footer.claimProfile, '/claim'],
        [t.footer.providerDashboard, '/dashboard'],
      ],
    ],
  ];

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
                <Roll>{t.footer.findClinic}</Roll>
              </Link>
              <div className="mt-5">
                <LanguageSwitcher variant="dark" />
              </div>
            </div>
            {columns.map(([h, links]) => (
              <div key={h}>
                <h4 className="site-foot-h">{h}</h4>
                <ul>
                  {links.map(([l, href]) => (
                    <li key={href}>
                      <Link href={href} className="site-foot-link">
                        {l}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="site-foot-legal">{t.footer.legal}</p>
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
