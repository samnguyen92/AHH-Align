import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  HeartHandshake,
  Languages,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { CountUp, ParallaxImage, Reveal, SplitTitle } from '@/components/lg/motion';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Asian Health Hub helps Vietnamese, Korean, and Chinese-speaking patients find language-accessible clinics across the United States.',
  alternates: {
    canonical: '/about',
  },
};

const ARROW = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

const stats = [
  {
    to: 9,
    suffix: '',
    label: 'Medical specialties covered in the directory',
  },
  {
    to: 10,
    suffix: '',
    label: 'Top Asian population metros coast to coast',
  },
  {
    to: 3,
    suffix: '+',
    label: 'Languages supported (Vietnamese, Korean & Chinese)',
  },
  {
    to: 100,
    suffix: '%',
    label: 'Free for patients and families, always',
  },
] as const;

const storyPoints = [
  {
    k: <><b>3.4M+</b> patients</>,
    title: 'Closing the communication gap',
    text: 'Over 3.4 million Vietnamese and Korean Americans face language barriers when seeking medical care, leading to delayed visits and avoidable stress.',
    image: '/brand/about/hero-language-care.webp',
    alt: 'Asian American patient speaking with a healthcare professional',
    href: '/search',
  },
  {
    k: <><b>Verified</b> profiles</>,
    title: 'Clear language & specialty details',
    text: 'We verify which languages are spoken by doctors and staff, alongside specialties, hours, insurance, and patient reviews in one transparent profile.',
    image: '/brand/lg/primary-care.jpg',
    alt: 'Doctor consulting with a patient in a bright clinic',
    href: '/search?groupBy=language',
  },
  {
    k: <><b>Under 5</b> minutes</>,
    title: 'From search to direct booking',
    text: 'Instead of calling multiple offices to ask about language support, families can compare clinics and connect directly in minutes.',
    image: '/brand/lg/family.jpg',
    alt: 'Multigenerational family walking out of a clinic together',
    href: '/search?groupBy=city',
  },
] as const;

const values = [
  {
    title: 'Language First',
    body: 'We believe language is not a barrier—it is a right. Every patient deserves medical care they can fully understand and trust.',
    icon: Languages,
  },
  {
    title: 'Radical Transparency',
    body: 'Every clinic profile highlights clear, actionable facts. We show what we verify and never hide essential details behind paywalls.',
    icon: ShieldCheck,
  },
  {
    title: 'Free for Patients',
    body: 'Asian Health Hub is 100% free for patients and caregivers. Finding culturally and linguistically aligned healthcare should never cost extra.',
    icon: HeartHandshake,
  },
  {
    title: 'Community First',
    body: 'Built specifically for Vietnamese, Korean, and Chinese American families—guided by real patient needs rather than ad networks.',
    icon: Users,
  },
] as const;

const steps = [
  {
    step: 'Step 01',
    title: 'Search the Directory',
    body: 'Select your medical specialty, metro area, and preferred language filter.',
    href: '/search',
    cta: 'Browse Directory',
    image: '/brand/about/step-search-directory.webp',
    imageAlt: 'Patient searching a clinic directory on a tablet',
  },
  {
    step: 'Step 02',
    title: 'Compare Clinic Profiles',
    body: 'Review languages spoken, services offered, hours, insurance, and patient feedback.',
    href: '/search?groupBy=specialty',
    cta: 'By Specialty',
    image: '/brand/about/step-browse-profiles.webp',
    imageAlt: 'Patient browsing a clinic profile on a tablet',
  },
  {
    step: 'Step 03',
    title: 'Filter by City or Language',
    body: 'Narrow down to major US metros or filter directly to Vietnamese, Korean, or Chinese support.',
    href: '/search?groupBy=city',
    cta: 'By City',
    image: '/brand/about/step-filter-language.webp',
    imageAlt: 'Patient filtering clinics by map and language options',
  },
  {
    step: 'Step 04',
    title: 'Book With the Clinic',
    body: 'Call the office or book directly on the clinic’s website—no account or middleman required.',
    href: '/search',
    cta: 'Find a Clinic',
    image: '/brand/about/step-contact-clinic.webp',
    imageAlt: 'Patient calling a clinic while viewing contact details',
  },
] as const;

export default function AboutPage() {
  return (
    <div className="lg">
      {/* ===== Section 1: Editorial Split Hero ===== */}
      <section className="lg-about-hero">
        <div className="lg-wrap">
          <div className="grid">
            <div>
              <span className="eyebrow-pill">About Asian Health Hub</span>
              <SplitTitle
                className="lg-title"
                text="Bridging the Language Gap in Asian American Healthcare"
                tintFrom={4}
              />
              <p className="lg-lede">
                Asian Health Hub was built on a simple belief: every patient deserves access to a clinic they can fully
                communicate with. We connect Vietnamese, Korean, and Chinese-speaking patients across the United States
                with trusted clinics that speak their language.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/search" className="lg-cta lg-cta--lime">
                  Find a Clinic {ARROW}
                </Link>
                <Link href="/claim" className="lg-cta lg-cta--line">
                  Claim a Free Profile
                </Link>
              </div>
            </div>

            <Reveal className="lg-about-photo" delay={0.1}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/about/hero-language-care.webp"
                alt="Asian American patient speaking with a healthcare professional"
                fetchPriority="high"
              />
              <div className="lg-about-chip">
                <b>3.4M+</b>
                <span>Vietnamese &amp; Korean Americans navigating language access in US healthcare</span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===== Section 2: Our Story (Sticky Claim + 3 Proof Rows) ===== */}
      <section className="lg-intro">
        <div className="lg-wrap">
          <div className="grid">
            <div className="lg-claim">
              <Reveal as="span" className="lg-eyebrow">Our Story</Reveal>
              <Reveal as="h2" delay={0.05}>
                Healthcare is too important to be <em>limited by language.</em>
              </Reveal>
              <Reveal as="p" delay={0.08} style={{ color: 'var(--lg-ink-2)', fontSize: 15.5, lineHeight: 1.65 }}>
                Language barriers in healthcare lead to misdiagnoses, medication errors, and patients avoiding necessary
                clinic visits altogether. Asian Health Hub was created to change that—putting language-first search in
                every family’s hands.
              </Reveal>
              <Reveal delay={0.12}>
                <Link href="/search" className="lg-link">Explore the clinic directory {ARROW}</Link>
              </Reveal>
            </div>

            <div className="lg-points">
              {storyPoints.map((p, i) => (
                <Reveal key={p.title} delay={0.05 + i * 0.07}>
                  <Link className="lg-point" href={p.href}>
                    <span className="ph">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt={p.alt} loading="lazy" />
                    </span>
                    <div>
                      <span className="k">{p.k}</span>
                      <h3>{p.title}</h3>
                      <p>{p.text}</p>
                    </div>
                    <span className="go" aria-hidden="true">{ARROW}</span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 3: Mission & Vision Split (Comp F Proof) ===== */}
      <section id="mission" className="lg-proof">
        <div className="lg-wrap">
          <div className="grid">
            <Reveal as="figure">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/about/mission-family-care.webp"
                alt="Healthcare professional discussing care with an older patient and family caregiver"
                loading="lazy"
              />
            </Reveal>

            <div>
              <Reveal as="span" className="lg-eyebrow">Mission &amp; Vision</Reveal>
              <Reveal as="h2" className="lg-h2" style={{ marginTop: 8 }}>
                Built so every family can choose care with clarity
              </Reveal>
              <Reveal as="p" delay={0.06} style={{ marginTop: 14, color: 'var(--lg-ink-2)', fontSize: 16, lineHeight: 1.65 }}>
                <strong style={{ color: 'var(--lg-ink)', fontWeight: 600 }}>Our Mission:</strong> To make
                language-accessible healthcare easy to find for every Vietnamese, Korean, and Chinese-speaking patient
                in the United States—for free, without barriers.
              </Reveal>
              <Reveal as="p" delay={0.1} style={{ marginTop: 12, color: 'var(--lg-ink-2)', fontSize: 16, lineHeight: 1.65 }}>
                <strong style={{ color: 'var(--lg-ink)', fontWeight: 600 }}>Our Vision:</strong> A United States where
                every patient can find a verified, language-compatible clinic in under 5 minutes from any city, for any
                specialty.
              </Reveal>

              <ul>
                <Reveal as="li" delay={0.12}>Verified Vietnamese, Korean, and Chinese language support</Reveal>
                <Reveal as="li" delay={0.16}>Transparent specialties, insurance, hours, and patient reviews</Reveal>
                <Reveal as="li" delay={0.2}>Direct connection to clinics with zero patient fees</Reveal>
              </ul>

              <Reveal delay={0.24}>
                <Link href="/search" className="lg-cta lg-cta--green">
                  Find clinics near me {ARROW}
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 4: Dark Stats Band (Comp F Night) ===== */}
      <section className="lg-night">
        <div className="lg-wrap">
          <div className="grid">
            <div>
              <Reveal as="h2">
                Built for community scale. <em>Free for every patient.</em>
              </Reveal>
              <Reveal as="p" delay={0.08}>
                We focus on the specialties and metropolitan areas where Asian American families live and work, making
                culturally informed care easier to discover nationwide.
              </Reveal>
            </div>

            <div className="lg-stats">
              {stats.map((stat, i) => (
                <Reveal key={stat.label} className="lg-stat" delay={i * 0.06}>
                  <CountUp to={stat.to} suffix={stat.suffix} />
                  <span>{stat.label}</span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 5: What We Stand For (Core Values) ===== */}
      <section className="lg-section">
        <div className="lg-wrap">
          <div className="lg-head">
            <div>
              <Reveal as="span" className="lg-eyebrow">Core Principles</Reveal>
              <Reveal as="h2" style={{ marginTop: 6 }}>What we stand for</Reveal>
              <Reveal as="p" className="sub">
                The principles that shape how we build Asian Health Hub and serve our community.
              </Reveal>
            </div>
          </div>

          <div className="lg-cgrid">
            {values.map((value, i) => {
              const Icon = value.icon;
              return (
                <Reveal key={value.title} delay={i * 0.06} className="lg-fill">
                  <div className="lg-vcard">
                    <span className="ico">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3>{value.title}</h3>
                    <p>{value.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Section 6: How Asian Health Hub Works ===== */}
      <section className="lg-section lg-section--band">
        <div className="lg-wrap">
          <div className="lg-head">
            <div>
              <Reveal as="span" className="lg-eyebrow">How It Works</Reveal>
              <Reveal as="h2" style={{ marginTop: 6 }}>How Asian Health Hub works</Reveal>
            </div>
            <Reveal>
              <Link href="/search" className="lg-link">Open Directory {ARROW}</Link>
            </Reveal>
          </div>

          <div className="lg-cgrid">
            {steps.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.06} className="lg-fill">
                <Link href={step.href} className="lg-ccard">
                  <div className="ph">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={step.image} alt={step.imageAlt} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="bd">
                    <div>
                      <span className="lg-eyebrow" style={{ fontSize: 11 }}>{step.step}</span>
                      <h3 style={{ marginTop: 4 }}>{step.title}</h3>
                      <p style={{ marginTop: 6, fontSize: 14, lineHeight: 1.55, color: 'var(--lg-ink-2)' }}>
                        {step.body}
                      </p>
                    </div>
                    <div className="foot">
                      <span>{step.cta}</span>
                      <b>Go <ArrowRight className="h-3.5 w-3.5" /></b>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Section 7: Parallax Film CTA ===== */}
      <section className="lg-film">
        <div className="lg-wrap">
          <div className="lg-panel">
            <ParallaxImage src="/brand/lg/family.jpg" alt="A family walks out of a clinic together" />
            <div className="copy">
              <Reveal as="h2">Ready to find care in the language your family trusts?</Reveal>
              <Reveal as="p" delay={0.08}>
                Browse verified clinics by language, specialty, or city—or claim your clinic’s free profile today.
              </Reveal>
              <Reveal delay={0.16} className="flex flex-wrap gap-3">
                <Link href="/search" className="lg-cta lg-cta--lime">Browse the Directory {ARROW}</Link>
                <Link href="/claim" className="lg-cta lg-cta--line">Claim Your Profile</Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
