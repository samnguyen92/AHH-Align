'use client';

import Image from 'next/image';
import { useState } from 'react';
import { getSafeArticleImageSrc } from '@/lib/article-image';

interface ArticleImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconSize?: number;
}

export function ArticleImage({
  src,
  alt,
  className = '',
  iconSize = 58,
}: ArticleImageProps) {
  const [failed, setFailed] = useState(false);
  const safeSrc = failed ? null : getSafeArticleImageSrc(src);

  return (
    <div className={`relative overflow-hidden bg-gray-100 ${className}`}>
      {safeSrc ? (
        <Image
          src={safeSrc}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 760px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full min-h-[180px] w-full items-center justify-center bg-[#e5e7eb] text-[#9fb2ca]">
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L6 20" />
          </svg>
        </div>
      )}
    </div>
  );
}
