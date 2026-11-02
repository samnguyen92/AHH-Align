'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { getSafeClinicImageSrc } from '@/lib/clinic-image';

/**
 * Longevity-style 3-panel Bento Gallery below the clinic hero header:
 * Left lead photo spans 2 rows (1.9fr), right column stacks 2 photos (1fr),
 * clicking any photo opens the full-screen lightbox.
 */
export function LgGallery({ images, name }: { images: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const safe = images.map((src) => getSafeClinicImageSrc(src)).filter((s): s is string => !!s);
  const shown = safe.slice(0, 3);
  const extraCount = Math.max(0, safe.length - 3);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % safe.length));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + safe.length) % safe.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, safe.length]);

  if (!shown.length) {
    return null;
  }

  const gridClass =
    shown.length === 1
      ? 'lg-prof-gallery lg-prof-gallery--one'
      : shown.length === 2
      ? 'lg-prof-gallery lg-prof-gallery--two'
      : 'lg-prof-gallery';

  return (
    <>
      <section aria-label={`${name} photos`} className="mt-6">
        <div className={gridClass}>
          {shown.map((src, i) => (
            <motion.figure
              key={src + i}
              className={`lg-prof-fig ${i === 0 ? 'lg-prof-fig--lead' : ''}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setOpen(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${name} clinic photo ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'auto'}
              />
              {i === shown.length - 1 && extraCount > 0 && (
                <button
                  type="button"
                  className="lg-prof-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(i);
                  }}
                >
                  +{extraCount} more photos
                </button>
              )}
            </motion.figure>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {open !== null && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${name} photos`}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(null)}
          >
            <motion.img
              key={safe[open]}
              src={safe[open]}
              alt={`${name} photo ${open + 1}`}
              className="max-h-[88vh] max-w-[92vw] rounded-2xl object-contain"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            />
            {safe.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  className="absolute left-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-xl text-white hover:bg-white/25"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen((open - 1 + safe.length) % safe.length);
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  className="absolute right-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-xl text-white hover:bg-white/25"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen((open + 1) % safe.length);
                  }}
                >
                  ›
                </button>
              </>
            )}
            <button
              type="button"
              aria-label="Close"
              className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-xl text-white hover:bg-white/25"
              onClick={() => setOpen(null)}
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
