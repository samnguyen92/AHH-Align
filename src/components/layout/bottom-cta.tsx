import { Search } from 'lucide-react';

export function BottomCTA() {
  return (
    <section className="home-bottom-cta bg-[#E5F0EB] px-[10px] pt-[10px]">
      <div className="home-bottom-cta-panel mx-auto flex min-h-[635px] w-full max-w-[1420px] items-center justify-center rounded-[16px] bg-[var(--ahh-deep-teal)] px-4 py-20 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[920px] text-center">
          <h2 className="mx-auto max-w-[820px] text-[46px] font-light leading-tight sm:text-[64px]">
            Ready to find care that understands you?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/70">
            Search trusted clinics by specialty, city, and language support.
          </p>

          <form action="/search" className="mx-auto mt-8 flex max-w-[920px] flex-col items-center gap-2 rounded-[20px] bg-white p-3 shadow-[0_18px_50px_rgba(2,78,68,0.14)] sm:flex-row">
            <div className="flex min-h-14 w-full flex-1 items-center gap-2 rounded-xl bg-white px-4">
              <Search className="h-4 w-4 text-[var(--ahh-deep-teal)]" />
              <input
                name="query"
                type="text"
                placeholder="Search by specialty, clinic name, or city..."
                className="flex-1 bg-transparent text-sm text-[var(--ahh-ink)] outline-none placeholder:text-[var(--ahh-muted-2)]"
              />
            </div>
            <button type="submit" className="min-h-14 rounded-xl bg-[var(--ahh-deep-teal)] px-8 text-[15px] font-medium text-white">
              Search
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
