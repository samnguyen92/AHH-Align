'use client';

/**
 * Motion primitives. Two layers on purpose:
 *  - CSS + IntersectionObserver for cheap, ubiquitous effects (Reveal, SplitTitle)
 *  - `motion` for physics / scroll-linked effects (CountUp, Parallax, TabIndicator, Rail)
 * Everything is visible at rest and respects prefers-reduced-motion.
 */

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { animate, motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react';

/* ---------- Reveal: fade/rise once when scrolled into view ---------- */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  className = '',
  style,
  children,
  ...rest
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`lg-rv ${className}`}
      data-in={seen}
      style={{ ...style, '--d': `${delay}s` } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* ---------- SplitTitle: words rise one by one ---------- */
export function SplitTitle({
  text,
  tintFrom,
  as: Tag = 'h1',
  className = '',
}: {
  text: string;
  /** index of the first word that gets the accent colour */
  tintFrom?: number;
  as?: ElementType;
  className?: string;
}) {
  const words = text.split(' ');
  return (
    <Tag className={`lg-split ${className}`} aria-label={text}>
      {words.map((word, i) => (
        <span key={i} aria-hidden="true">
          <span className={`w${tintFrom !== undefined && i >= tintFrom ? ' tint' : ''}`}>
            <span style={{ '--i': i } as CSSProperties}>{word}</span>
          </span>{' '}
        </span>
      ))}
    </Tag>
  );
}

/* ---------- CountUp: number eases up when it enters the viewport ---------- */
export function CountUp({ to, duration = 1.6, className, suffix = '' }: { to: number; duration?: number; className?: string; suffix?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (!inView || reduce) return;
    setValue(0);
    const controls = animate(0, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduce, to, duration]);

  return (
    <b ref={ref} className={className}>
      {value.toLocaleString('en-US')}{suffix}
    </b>
  );
}

/* ---------- Parallax image: drifts against scroll inside its panel ---------- */
export function ParallaxImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-6%', '6%']);

  return (
    <div ref={ref} className="absolute inset-0 z-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src={src}
        alt={alt}
        className={className}
        style={reduce ? undefined : { y, scale: 1.14 }}
      />
    </div>
  );
}

/* ---------- Rail: horizontal scroller with prev / next buttons ---------- */
export function Rail({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const scrollBy = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(300, el.clientWidth * 0.7), behavior: 'smooth' });
  };
  const arrow = (d: string) => (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={d} />
    </svg>
  );
  return (
    <>
      <div className="lg-head">
        <Reveal as="h2">{title}</Reveal>
        <div className="lg-arrows">
          <button type="button" className="lg-round" aria-label="Previous" onClick={() => scrollBy(-1)}>
            {arrow('M14 9H4M8 5L4 9l4 4')}
          </button>
          <button type="button" className="lg-round" aria-label="Next" onClick={() => scrollBy(1)}>
            {arrow('M4 9h10M10 5l4 4-4 4')}
          </button>
        </div>
      </div>
      <div className="lg-rail" ref={ref}>
        {children}
      </div>
    </>
  );
}

/* ---------- Sub-nav tabs with a gliding indicator + scroll-spy ---------- */
export function TabNav({ tabs }: { tabs: { id: string; label: string }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  useEffect(() => {
    const sections = tabs
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => !!el);
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-140px 0px -55% 0px', threshold: 0 }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [tabs]);

  return (
    <div className="lg-subnav" data-offset="true">
      <div className="lg-prof-wrap">
        <nav className="lg-tabs" aria-label="On this profile">
          {tabs.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              aria-current={active === t.id}
              onClick={() => setActive(t.id)}
            >
              {t.label}
              {active === t.id && (
                <motion.span
                  layoutId="lg-tab-indicator"
                  className="ind"
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                />
              )}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
