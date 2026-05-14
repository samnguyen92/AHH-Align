import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Claim Your Clinic Profile | Asian Health Hub',
};

export default function ClaimLandingPage() {
  return (
    <main className="bg-gray-50 px-4 py-16 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ahh-blue)]">
          Provider ownership
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
          Claim your clinic profile
        </h1>
        <p className="mt-4 text-base leading-7 text-gray-600">
          Find your clinic in the Asian Health Hub directory, open the profile, and submit a verification request. Our team will review the proof before granting dashboard access.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/search"
            className="rounded-lg bg-[var(--ahh-blue)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--ahh-blue-dark)]"
          >
            Find your profile
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-white"
          >
            Create provider account
          </Link>
        </div>
      </section>
    </main>
  );
}
