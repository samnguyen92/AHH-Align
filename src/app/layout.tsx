import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { BottomCTA } from '@/components/layout/bottom-cta';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
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
    siteName: 'Asian Health Hub',
    title: 'Asian Health Hub — Find Clinics That Speak Your Language',
    description:
      'Find healthcare providers who speak Vietnamese, Korean, Chinese, and other Asian languages.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Header />
        <main className="flex-1">{children}</main>
        <BottomCTA />
        <Footer />
      </body>
    </html>
  );
}
