import Link from 'next/link';

interface BrandLogoProps {
  href?: string;
  inverted?: boolean;
  compact?: boolean;
  className?: string;
}

export function BrandMark({ inverted = false, className = '' }: Pick<BrandLogoProps, 'inverted' | 'className'>) {
  const stroke = inverted ? '#FFFFFF' : 'var(--ahh-deep-teal)';
  const accent = inverted ? 'var(--ahh-lime)' : 'var(--ahh-lime)';

  return (
    <svg
      viewBox="0 0 64 48"
      aria-hidden="true"
      className={className || 'h-9 w-12'}
      fill="none"
    >
      <path
        d="M8 39c2.7-18.7 10.5-29 23.4-29 13.4 0 21.2 10.3 23.3 29"
        stroke={stroke}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M12 31h14"
        stroke={stroke}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M33.6 30.5 28.2 25c-2.3-2.4-2.1-6.1.4-8.2 2.1-1.7 5.2-1.4 7 .7l1 1 1-1c1.9-2 4.9-2.4 7-.7 2.6 2.1 2.7 5.9.4 8.2l-8.4 8.5"
        stroke={accent}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27.5" cy="23" r="2.7" fill={stroke} />
    </svg>
  );
}

export function BrandLogo({
  href = '/',
  inverted = false,
  compact = false,
  className = '',
}: BrandLogoProps) {
  const content = (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src={inverted ? '/brand/ahh-logo-upload-white.svg' : '/brand/ahh-logo-upload-dark.svg'}
        alt="Asian Health Hub"
        className={compact ? 'h-7 w-auto md:h-10' : 'h-9 w-auto md:h-11'}
      />
    </span>
  );

  return href ? (
    <Link href={href} className="inline-flex shrink-0 items-center">
      {content}
    </Link>
  ) : (
    content
  );
}
