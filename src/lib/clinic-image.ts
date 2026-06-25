const UNSAFE_IMAGE_PATTERNS = [
  '/Users/',
  'source.unsplash.com',
  'captcha',
  'perfdrive',
  'recaptcha',
  'g-recaptcha',
  'bot-detection',
];

export function getSafeClinicImageSrc(src?: string | null): string | null {
  const value = src?.trim();

  if (!value) return null;

  if (UNSAFE_IMAGE_PATTERNS.some((pattern) => value.includes(pattern))) {
    return null;
  }

  if (
    value.startsWith('/generated-clinics/') ||
    value.startsWith('/images/') ||
    value.startsWith('/uploads/') ||
    value.startsWith('data:image/') ||
    value.startsWith('/')
  ) {
    return value;
  }

  if (value.startsWith('https://') || value.startsWith('http://')) {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();

      // Check against allowed domains from next.config.ts remotePatterns
      const isSupabase = hostname.endsWith('.supabase.co') || hostname === 'supabase.co';
      const isGoogle = hostname === 'lh3.googleusercontent.com' || hostname.endsWith('.googleusercontent.com');
      const isWix = hostname === 'static.wixstatic.com';
      const isAnchor = hostname === 'anchordentalga.com' || hostname.endsWith('.anchordentalga.com');

      if (isSupabase || isGoogle || isWix || isAnchor) {
        return value;
      }
      
      // If it's a random external domain, return null to prevent next/image runtime crashes
      return null;
    } catch {
      return null;
    }
  }

  return null;
}
