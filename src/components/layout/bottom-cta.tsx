import Link from 'next/link';

/** Shared blue CTA section — "Ready to Find a Clinic..." — appears on every page before footer */
export function BottomCTA() {
  return (
    <section className="bg-[var(--ahh-blue)] py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
          Ready to Find a Clinic That Speaks Your Language?
        </h2>
        <p className="mt-4 text-base text-blue-100 leading-relaxed max-w-xl mx-auto">
          Search our free directory of Vietnamese and Korean-speaking clinics across 50+ major US cities. No account. No fees. Just care you can understand.
        </p>

        {/* Search bar */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-2 max-w-2xl mx-auto">
          <div className="flex-1 w-full flex items-center gap-2 bg-white rounded-lg px-3 py-2">
            <input
              type="text"
              placeholder="Search by specialty, clinic name, or keyword..."
              className="flex-1 text-sm text-gray-700 placeholder:text-gray-400 bg-transparent outline-none"
              readOnly
            />
            <span className="text-xs text-gray-400 hidden sm:inline">Specialty</span>
            <span className="text-xs text-gray-400 hidden sm:inline">City</span>
            <span className="text-xs text-gray-400 hidden sm:inline">Language</span>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold rounded-lg bg-[var(--ahh-blue-dark)] text-white hover:bg-[var(--ahh-blue-900)] transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            Search
          </Link>
        </div>
      </div>
    </section>
  );
}
