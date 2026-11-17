import type { Metadata } from 'next';
import { PageViewTracker } from '@/components/layout/page-view-tracker';
import { SiteChrome } from '@/components/layout/site-chrome';
import { JsonLd } from '@/lib/json-ld';
import { absoluteUrl, SITE_NAME, SITE_URL } from '@/lib/site';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import './globals.css';
import './longevity.css';

const dmSans = { variable: '--font-sans' };
const geist = { variable: '--font-lg-sans' };
const geistMono = { variable: '--font-lg-mono' };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Asian Health Hub — Find Clinics That Speak Your Language',
    template: '%s | Asian Health Hub',
  },
  description:
    'Find healthcare providers who speak Vietnamese, Korean, Chinese, and other Asian languages. Search by specialty, city, and language.',
  keywords: [
    'Asian American healthcare',
    'Vietnamese doctor',
    'Korean doctor',
    'Chinese doctor',
    'multilingual healthcare',
    'Asian Health Hub',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: SITE_NAME,
    title: 'Asian Health Hub — Find Clinics That Speak Your Language',
    description:
      'Find healthcare providers who speak Vietnamese, Korean, Chinese, and other Asian languages.',
    url: SITE_URL,
    images: [{ url: absoluteUrl('/opengraph-image'), width: 1200, height: 630 }],
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  robots: {
    index: true,
    follow: true,
  },
};

import Script from 'next/script';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/icon.svg'),
  };

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?query={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="en" className={`${dmSans.variable} ${geist.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Geist+Mono:wght@100..900&display=swap"
          rel="stylesheet"
        />
        {/* Homepage native-script words only (subset by the text parameter), so CJK fonts stay a few KB. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@600&family=Noto+Sans+SC:wght@600&text=%E4%B8%AD%E5%A5%BD%E6%82%A8%E6%96%87%EA%B5%AD%EB%85%95%EC%84%B8%EC%95%88%EC%96%B4%EC%9A%94%ED%95%98%ED%95%9C&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        )}
        <JsonLd data={[organizationJsonLd, websiteJsonLd]} />
        <PageViewTracker />
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
