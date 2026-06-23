import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  HeartHandshake,
  Languages,
  MapPin,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Asian Health Hub helps Vietnamese and Korean-speaking patients find language-accessible clinics across the United States.',
  alternates: {
    canonical: '/about',
  },
};

const stats = [
  {
    value: '9',
    label: 'Medical Specialties',
    detail: 'Covered in the directory',
  },
  {
    value: '10',
    label: 'Top Asian Population Metros',
    detail: 'Coast to coast coverage',
  },
  {
    value: '+2',
    label: 'Language Support',
    detail: 'Vietnamese and Korean',
  },
  {
    value: '100%',
    label: 'Free for Patients',
    detail: 'Always, forever',
  },
] as const;

const values = [
  {
    title: 'Language First',
    body: 'We believe language is not a barrier. It is a right. Every patient deserves care they can fully understand.',
    icon: Languages,
  },
  {
    title: 'Radical Transparency',
    body: 'Every clinic listing is verified. We show what we know and do not publish what we cannot confirm.',
    icon: ShieldCheck,
  },
  {
    title: 'Free for Patients',
    body: 'Asian Health Hub is free to use for every patient. Healthcare access should not cost extra.',
    icon: HeartHandshake,
  },
  {
    title: 'Community First',
    body: 'We are built for Vietnamese and Korean American communities, powered by patient needs, not advertisers.',
    icon: Users,
  },
] as const;

const steps = [
  {
    title: 'Search the Directory',
    body: 'Enter your specialty, city, and preferred language filter.',
    href: '/search',
    cta: 'Browse the Directory',
    image: '/brand/about/step-search-directory.webp',
    imageAlt: 'Patient searching a clinic directory on a tablet',
  },
  {
    title: 'Browse Clinic Profiles',
    body: 'Each profile shows languages spoken, services, hours, insurance, and patient reviews.',
    href: '/search?groupBy=specialty',
    cta: 'Browse by Specialty',
    image: '/brand/about/step-browse-profiles.webp',
    imageAlt: 'Patient browsing a clinic profile on a tablet',
  },
  {
    title: 'Filter by City or Language',
    body: 'Narrow down by the US cities we cover, or filter directly to Vietnamese or Korean language support.',
    href: '/search?groupBy=city',
    cta: 'Find Clinics in Your City',
    image: '/brand/about/step-filter-language.webp',
    imageAlt: 'Patient filtering clinics by map and language options',
  },
  {
    title: 'Contact the Clinic',
    body: 'Call, visit the clinic website, or book directly. No account needed.',
    href: '/search',
    cta: 'Find a Clinic Now',
    image: '/brand/about/step-contact-clinic.webp',
    imageAlt: 'Patient calling a clinic while viewing contact details',
  },
] as const;

const featureLinks = [
  {
    title: 'Directory',
    body: 'Search by specialty, city, and language.',
    icon: Search,
  },
  {
    title: 'Language Access',
    body: 'Compare verified language support before booking.',
    icon: Languages,
  },
  {
    title: 'Local Care',
    body: 'Find clinics across major Asian American population metros.',
    icon: MapPin,
  },
] as const;

function AboutImage({
  src,
  alt,
  className = '',
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-[12px] bg-[#E9EEF4] ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 520px"
        className="object-cover"
      />
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="bg-[#92C7AD] px-[10px] pb-[10px]">
      <div className="home-shell">
      <section className="overflow-hidden rounded-[16px] bg-[var(--ahh-deep-teal)] text-white">
        <div className="grid min-h-[660px] items-center gap-10 px-6 pb-16 pt-32 sm:px-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-24 lg:pb-20 lg:pt-40">
            <div className="max-w-3xl">
              <p className="mb-5 inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/75">
                About Asian Health Hub
              </p>
              <h1 className="text-[44px] font-light leading-[1.05] tracking-normal sm:text-[58px] lg:text-[72px]">
                Bridging the Language Gap in Asian American Healthcare
              </h1>
              <p className="mt-7 max-w-2xl text-[17px] leading-7 text-white/70">
                Asian Health Hub was built on a simple belief: every patient deserves access to a clinic they can fully communicate with. We connect Vietnamese and Korean-speaking patients across the US with verified clinics that speak their language.
              </p>
              <Link href="/search" className="brand-button mt-8">
                <Search className="h-4 w-4" />
                Find a Clinic
              </Link>
            </div>
            <AboutImage
              src="/brand/about/hero-language-care.webp"
              alt="Asian American patient speaking with a healthcare professional"
              className="min-h-[260px] w-full bg-white/90 lg:min-h-[340px]"
              priority
            />
          </div>
      </section>

      <section className="home-stats-grid">
          {stats.map((stat) => (
            <div key={stat.label} className="min-h-[220px] rounded-[20px] bg-white p-7 shadow-[0_18px_50px_rgba(2,78,68,0.08)]">
              <p className="text-[64px] font-bold leading-none text-[var(--ahh-deep-teal)]">{stat.value}</p>
              <h2 className="mt-4 max-w-[240px] text-2xl font-medium leading-tight text-[var(--ahh-ink)]">{stat.label}</h2>
              <p className="mt-3 text-[13px] leading-5 text-[var(--ahh-muted)]">{stat.detail}</p>
            </div>
          ))}
      </section>

      <section className="home-section grid gap-12 rounded-[16px] bg-white px-5 py-20 sm:px-10 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:px-20 lg:py-[110px]">
        <div>
          <h2 className="max-w-lg text-[42px] font-light leading-[1.08] text-[var(--ahh-ink)] lg:text-[58px]">Our Story</h2>
          <div className="mt-8 space-y-6 text-[15px] leading-7 text-[var(--ahh-muted)]">
            <p>
              Language barriers in healthcare lead to misdiagnoses, medication errors, and patients avoiding necessary clinic visits altogether. For Vietnamese and Korean Americans, this is a daily reality. We believe that should not be the case, healthcare is too important to be limited by language.
            </p>
            <p>
              Asian Health Hub was created to change that: to build a free, trusted, searchable clinic directory that puts Vietnamese and Korean-speaking patients first. A place where finding the right clinic takes minutes, not days.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[18px] border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)] p-6">
            <div className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ahh-mist)] text-[var(--ahh-blue)]">
                <Users className="h-4 w-4" />
              </span>
              <p className="text-xs leading-5 text-[var(--ahh-muted)]">
                <strong className="text-[var(--ahh-ink)]">3.4M+</strong> Vietnamese and Korean Americans who face language barriers every time they seek clinic care in the US.
              </p>
            </div>
          </div>
          <div className="rounded-[18px] border border-[var(--ahh-border)] bg-[var(--ahh-mist-2)] p-6">
            <div className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ahh-mist)] text-[var(--ahh-blue)]">
                <Stethoscope className="h-4 w-4" />
              </span>
              <p className="text-xs leading-5 text-[var(--ahh-muted)]">
                <strong className="text-[var(--ahh-ink)]">Result:</strong> delayed care, missed diagnoses, and avoidance of clinics.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="mission" className="home-section grid gap-12 rounded-[16px] bg-[var(--ahh-mist-2)] px-5 py-20 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:items-center lg:px-20 lg:py-[100px]">
        <div className="space-y-10">
          <div>
            <h2 className="text-[42px] font-light leading-[1.08] text-[var(--ahh-ink)] lg:text-[58px]">Our Mission</h2>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-[var(--ahh-muted)]">
              To make language-accessible healthcare easy to find for every Vietnamese and Korean patient in the United States for free, without barriers.
            </p>
          </div>
          <div>
            <h2 className="text-[32px] font-medium leading-tight text-[var(--ahh-ink)]">Our Vision</h2>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-[var(--ahh-muted)]">
              A United States where every Vietnamese or Korean patient can find a verified, language-compatible clinic in under 5 minutes from any city, for any specialty.
            </p>
          </div>
        </div>
        <AboutImage
          src="/brand/about/mission-family-care.webp"
          alt="Healthcare professional discussing care with an older patient and family caregiver"
          className="min-h-[360px] w-full"
        />
      </section>

      <section className="home-section rounded-[16px] bg-white px-5 py-20 sm:px-10 lg:px-20 lg:py-[92px]">
          <h2 className="text-[42px] font-light leading-tight text-[var(--ahh-ink)] lg:text-[56px]">What We Stand For</h2>
          <p className="mt-5 max-w-3xl text-sm leading-6 text-[var(--ahh-muted)]">
            These are the principles that shape how we build Asian Health Hub and how we serve our community.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <div key={value.title} className="rounded-[18px] bg-[var(--ahh-mist-2)] p-6 lg:min-h-[230px]">
                  <Icon className="h-5 w-5 text-[var(--ahh-blue)]" />
                  <h3 className="mt-4 text-sm font-bold text-[var(--ahh-ink)]">{value.title}</h3>
                  <p className="mt-3 text-xs leading-6 text-[var(--ahh-muted)]">{value.body}</p>
                </div>
              );
            })}
          </div>
      </section>

      <section className="home-section rounded-[16px] bg-[var(--ahh-mist-2)] px-5 py-20 sm:px-10 lg:px-20 lg:py-[96px]">
        <div className="mb-8">
          <h2 className="text-[42px] font-light leading-tight text-[var(--ahh-ink)] lg:text-[56px]">How Asian Health Hub Works</h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[var(--ahh-muted)]">
            Finding a language-accessible clinic near you should be simple.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title} className="brand-card overflow-hidden">
              <AboutImage src={step.image} alt={step.imageAlt} className="h-40 rounded-none bg-[#D9D9D9]" />
              <div className="p-5">
                <h3 className="text-sm font-bold text-[var(--ahh-ink)]">
                  {index + 1}. {step.title}
                </h3>
                <p className="mt-3 min-h-[72px] text-xs leading-6 text-[var(--ahh-muted)]">{step.body}</p>
                <Link href={step.href} className="brand-button-secondary mt-4 min-h-8 px-4 py-2 text-xs">
                  {step.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section rounded-[16px] bg-white px-5 py-12 sm:px-10 lg:px-20">
        <div className="grid gap-5 rounded-[16px] bg-[var(--ahh-mist-2)] p-6 sm:grid-cols-3 sm:p-8">
          {featureLinks.map((item) => {
            const ItemIcon = item.icon;
            return (
              <div key={item.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ahh-mist)] text-[var(--ahh-blue)]">
                  <ItemIcon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--ahh-ink)]">{item.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--ahh-muted)]">{item.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      </div>
    </div>
  );
}
