import { HeroSearch } from '@/components/home/hero-search';

export function BottomCTA() {
  return (
    <section className="home-bottom-cta bg-[#E5F0EB] px-[10px] pt-[10px]">
      <div className="home-bottom-cta-panel mx-auto flex min-h-[635px] w-full max-w-[1420px] items-center justify-center rounded-[16px] bg-[var(--ahh-deep-teal)] px-4 py-20 text-white sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[920px] text-center">
          <h2 className="mx-auto max-w-[820px] text-[46px] font-light leading-tight sm:text-[64px]">
            Ready to find care that understands you?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/70">
            Search trusted clinics by specialty, city, and language support.
          </p>

          <div className="mx-auto mt-8 w-full max-w-[920px] text-left">
            <HeroSearch />
          </div>
        </div>
      </div>
    </section>
  );
}
