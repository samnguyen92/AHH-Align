import Link from 'next/link';
import { HeroSearch } from '@/components/home/hero-search';

const STATS = [
  { icon: '🏥', value: '10', label: 'States Covered' },
  { icon: '👨‍⚕️', value: '10', label: 'Specialties' },
  { icon: '🌐', value: '+2', label: 'Asian Languages' },
  { icon: '✅', value: '100%', label: 'Free to Use' },
] as const;

const SPECIALTIES = [
  { icon: '🩺', name: 'Primary Care', count: 240 },
  { icon: '🦷', name: 'Dentistry', count: 185 },
  { icon: '👁️', name: 'Eye Care', count: 92 },
  { icon: '❤️', name: 'Cardiology', count: 78 },
  { icon: '🧠', name: 'Psychiatry', count: 56 },
  { icon: '🦴', name: 'Orthopedics', count: 64 },
  { icon: '👶', name: 'Pediatrics', count: 130 },
  { icon: '🤰', name: 'OB/GYN', count: 95 },
] as const;

const TOP_CITIES = [
  { name: 'Los Angeles, CA', count: 450 },
  { name: 'San Jose, CA', count: 380 },
  { name: 'Houston, TX', count: 320 },
  { name: 'New York, NY', count: 290 },
  { name: 'Seattle, WA', count: 180 },
  { name: 'Chicago, IL', count: 150 },
] as const;

const GUIDES = [
  {
    title: 'Understanding Your Healthcare Options as a Vietnamese Immigrant',
    category: 'Guide',
    slug: 'healthcare-options-vietnamese',
  },
  {
    title: "A Parent's Insurance Guide for Vietnamese Families",
    category: 'Insurance',
    slug: 'insurance-guide-vietnamese',
  },
  {
    title: 'How to Book a Wellness Visit in Your Language',
    category: 'Guide',
    slug: 'book-wellness-visit',
  },
] as const;

export default function HomePage() {
  return (
    <>
      {/* ===== HERO — Blue banner ===== */}
      <section className="relative bg-[var(--ahh-blue)] py-16 sm:py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Decorative shape */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative mx-auto max-w-7xl flex flex-col lg:flex-row items-center gap-10">
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
              Find an Asian Clinic<br />
              That Speaks Your Language
            </h1>
            <p className="mt-4 text-base text-blue-100 leading-relaxed max-w-lg mx-auto lg:mx-0">
              Asian Health Hub connects Vietnamese and Korean-speaking patients with trusted clinics across the United States. Search by specialty, city, or language and get care you truly understand.
            </p>
          </div>
          {/* Placeholder image */}
          <div className="w-52 h-52 sm:w-60 sm:h-60 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
          </div>
        </div>

        {/* Search Bar — overlapping */}
        <div className="relative mx-auto max-w-4xl mt-10">
          <HeroSearch />
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="py-10 px-4 sm:px-6 lg:px-8 border-b border-gray-100">
        <div className="mx-auto max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-6 stagger-children">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 justify-center md:justify-start">
              <span className="text-3xl">{stat.icon}</span>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-xs text-gray-500">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== TOP TRUSTED CLINICS ===== */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-gray-900">Top Trusted Asian Clinics</h2>
            <Link href="/search" className="text-sm font-medium text-[var(--ahh-blue)] hover:underline">
              View All →
            </Link>
          </div>
          {/* Clinic cards placeholder grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 stagger-children">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="group rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-[4/3] bg-gray-100" />
                <div className="p-3">
                  <div className="h-3 w-3/4 bg-gray-100 rounded mb-2" />
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map((s) => (
                      <svg key={s} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={s <= 4 ? '#F59E0B' : 'none'} stroke="#F59E0B" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    ))}
                    <span className="text-xs text-gray-400 ml-1">4.0</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-[var(--ahh-blue)] rounded">Vietnamese</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== EXPLORE SPECIALTIES ===== */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-10">
            <h2 className="text-xl font-bold text-gray-900">Explore Featured Specialties</h2>
            <p className="mt-2 text-sm text-gray-500">Find clinics by the type of care you need</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 stagger-children">
            {SPECIALTIES.map((spec) => (
              <Link
                key={spec.name}
                href={`/search?specialty=${encodeURIComponent(spec.name)}`}
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-[var(--ahh-blue)]/30 hover:shadow-sm transition-all group"
              >
                <span className="text-2xl">{spec.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-gray-900 group-hover:text-[var(--ahh-blue)] transition-colors">{spec.name}</div>
                  <div className="text-xs text-gray-400">{spec.count}+ clinics</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FIND CLINICS BY CITY ===== */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-xl font-bold text-gray-900 mb-8">Find Clinics by City</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {TOP_CITIES.map((city) => (
              <Link
                key={city.name}
                href={`/search?city=${encodeURIComponent(city.name.split(',')[0])}`}
                className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-[var(--ahh-blue)]/30 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ahh-blue)" strokeWidth="1.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{city.name}</span>
                </div>
                <span className="text-xs text-gray-400">{city.count}+ clinics</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY IT MATTERS ===== */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Healthcare in someone&apos;s language shouldn&apos;t be a barrier.
            </h2>
            <p className="mt-4 text-gray-600 leading-relaxed">
              Language barriers are one of the biggest reasons Asian Americans avoid seeking healthcare.
              Asian Health Hub was built to change that — connecting patients with providers who speak
              their language and understand their culture.
            </p>
            <div className="mt-6 flex gap-3">
              <Link
                href="/search"
                className="inline-flex items-center px-5 py-2.5 text-sm font-semibold rounded-lg bg-[var(--ahh-blue)] text-white hover:bg-[var(--ahh-blue-dark)] transition-colors"
              >
                Find a Clinic
              </Link>
              <Link
                href="/insights"
                className="inline-flex items-center px-5 py-2.5 text-sm font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Learn More
              </Link>
            </div>
          </div>
          {/* Placeholder */}
          <div className="w-full lg:w-96 h-64 bg-gray-200 rounded-2xl flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
          </div>
        </div>
      </section>

      {/* ===== FOR CLINIC OWNERS ===== */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-xl font-bold text-gray-900">Are You a Clinic Owner? Join Asian Health Hub</h2>
          <p className="mt-3 text-sm text-gray-500 leading-relaxed max-w-xl mx-auto">
            Claim your free profile to reach thousands of patients looking for culturally competent care.
            Update your information, respond to reviews, and grow your practice.
          </p>
          <Link
            href="/claim"
            className="inline-flex items-center mt-6 px-6 py-2.5 text-sm font-semibold rounded-lg bg-[var(--ahh-blue)] text-white hover:bg-[var(--ahh-blue-dark)] transition-colors"
          >
            Claim Your Free Profile
          </Link>
        </div>
      </section>

      {/* ===== HEALTH INSIGHTS ===== */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-gray-900">Health Insights and Guide for Patients</h2>
            <Link href="/insights" className="text-sm font-medium text-[var(--ahh-blue)] hover:underline">
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                href={`/insights/${guide.slug}`}
                className="group bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-video bg-gray-100" />
                <div className="p-4">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ahh-blue)]">{guide.category}</span>
                  <h3 className="mt-1 text-sm font-semibold text-gray-900 group-hover:text-[var(--ahh-blue)] transition-colors line-clamp-2">
                    {guide.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
