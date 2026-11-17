'use client';

// <img> that swaps to a fallback when the source is missing.
import { useEffect, useRef, useState } from 'react';

export function SiteImg({
  src,
  fallback,
  alt,
  className,
  style,
  eager,
}: {
  src: string | null;
  fallback: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  eager?: boolean;
}) {
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);
  // a server-rendered image can fail before React attaches onError; catch that case once mounted
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0 && src) setBad(true);
  }, [src]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={!src || bad ? fallback : src}
      alt={alt}
      className={className}
      style={style}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setBad(true)}
    />
  );
}
