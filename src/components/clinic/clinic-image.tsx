'use client';

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { getSafeClinicImageSrc } from '@/lib/clinic-image';

interface ClinicImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}

export function ClinicImage({
  src,
  alt,
  className = '',
  iconClassName = 'h-12 w-12',
}: ClinicImageProps) {
  const [failed, setFailed] = useState(false);
  const safeSrc = failed ? null : getSafeClinicImageSrc(src);

  return (
    <div className={`relative overflow-hidden bg-gray-200 ${className}`}>
      {safeSrc ? (
        <img
          src={safeSrc}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
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
