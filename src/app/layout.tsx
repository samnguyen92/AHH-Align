import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import { PageViewTracker } from '@/components/layout/page-view-tracker';
import { SiteChrome } from '@/components/layout/site-chrome';
import { JsonLd } from '@/lib/json-ld';
import { absoluteUrl, SITE_NAME, SITE_URL } from '@/lib/site';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

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
    logo: absoluteUrl('/favicon.ico'),
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
    <html lang="en" className={`${dmSans.variable} h-full antialiased`} suppressHydrationWarning>
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
