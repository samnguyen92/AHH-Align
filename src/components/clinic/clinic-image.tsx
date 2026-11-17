'use client';

import Image from 'next/image';
import { useState } from 'react';
import { getSafeClinicImageSrc, getClinicFallbackImage } from '@/lib/clinic-image';

interface ClinicImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  fallbackSrc?: string | null;
  specialty?: string | null;
}

export function ClinicImage({
  src,
  alt,
  className = '',
  iconClassName = 'h-12 w-12',
  fallbackSrc,
  specialty,
}: ClinicImageProps) {
  const [failCount, setFailCount] = useState(0);
  const fallback = fallbackSrc || getClinicFallbackImage(specialty, alt);
  const candidateSrc = getSafeClinicImageSrc(src);

  let activeSrc: string | null = candidateSrc || fallback;
  if (failCount === 1) {
    activeSrc = fallback && fallback !== candidateSrc ? fallback : '/brand/lg/primary-care.jpg';
  } else if (failCount >= 2) {
    activeSrc = '/brand/lg/primary-care.jpg';
  }

  const isUpload = Boolean(activeSrc && (activeSrc.startsWith('/uploads/') || activeSrc.startsWith('/generated-clinics/')));

  return (
    <div className={`relative overflow-hidden bg-gray-200 ${className}`}>
      {activeSrc && failCount < 3 ? (
        <Image
          src={activeSrc}
          alt={alt}
          fill
          unoptimized={isUpload}
          sizes="(max-width: 768px) 100vw, 384px"
          className="object-cover"
          onError={() => setFailCount((c) => c + 1)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-200 text-gray-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={iconClassName}
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L6 20" />
          </svg>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
    </div>
  );
}
