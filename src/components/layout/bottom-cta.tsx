import Link from 'next/link';
import { Search } from 'lucide-react';

export function BottomCTA() {
  return (
    <section className="bg-[var(--ahh-seafoam)] p-1 sm:p-2">
      <div className="rounded-[var(--ahh-radius)] bg-[var(--ahh-deep-teal)] px-4 py-20 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
          Ready to Find a Clinic That Speaks Your Language?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/70">
          Search our directory of Vietnamese and Korean-speaking clinics, compare practical details,
          and find care you can understand.
        </p>

        <form action="/search" className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-2 sm:flex-row">
          <div className="flex min-h-11 w-full flex-1 items-center gap-2 rounded-full bg-white px-4">
            <Search className="h-4 w-4 text-[var(--ahh-deep-teal)]" />
            <input
              name="query"
              type="text"
              placeholder="Search by specialty, clinic name, or city..."
              className="flex-1 bg-transparent text-sm text-[var(--ahh-ink)] outline-none placeholder:text-[var(--ahh-muted-2)]"
            />
          </div>
          <button type="submit" className="brand-button min-h-11 px-7">
            Search
          </button>
        </form>

        <Link href="/search" className="mt-5 inline-flex text-xs font-bold text-[var(--ahh-lime)] hover:underline">
          Browse all clinics
        </Link>
      </div>
      </div>
    </section>
  );
}
