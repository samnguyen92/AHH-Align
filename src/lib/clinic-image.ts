const UNSAFE_IMAGE_PATTERNS = [
  '/Users/',
  'source.unsplash.com',
  'captcha',
  'perfdrive',
  'recaptcha',
  'g-recaptcha',
  'bot-detection',
];

/**
 * Neutral placeholder shown when a clinic has no real photo. We deliberately never show a stock/demo photo
 * (Unsplash, site brand shots) as if it were the clinic: photo order is website -> Google -> this placeholder.
 */
export const CLINIC_PLACEHOLDER_IMAGE = '/brand/clinic-placeholder.svg';

export function getClinicFallbackImage(_specialty?: string | null, _seed?: string | number): string {
  return CLINIC_PLACEHOLDER_IMAGE;
}

export function getSafeClinicImageSrc(src?: string | null): string | null {
  const value = src?.trim();

  if (!value) return null;

  if (UNSAFE_IMAGE_PATTERNS.some((pattern) => value.includes(pattern))) {
    return null;
  }

  // Rewrite legacy Supabase storage URLs to local public paths
  if (value.includes('supabase.co/storage/v1/object/public/generated-images/')) {
    const parts = value.split('supabase.co/storage/v1/object/public/generated-images/');
    if (parts[1]) {
      return `/uploads/${parts[1]}`.replace('//', '/');
    }
  }

  // Map /generated-clinics/ to the physical static directory /uploads/generated-clinics/
  if (value.startsWith('/generated-clinics/')) {
    return `/uploads${value}`;
  }

  if (
    value.startsWith('/brand/') ||
    value.startsWith('/generated-clinics/') ||
    value.startsWith('/generated-insights/') ||
    value.startsWith('/images/') ||
    value.startsWith('/uploads/') ||
    value.startsWith('data:image/') ||
    value.startsWith('/')
  ) {
    return value.startsWith('/') && !value.startsWith('data:') ? value.split('?')[0] : value;
  }

  if (value.startsWith('https://') || value.startsWith('http://')) {
    try {
      new URL(value);
      return value;
    } catch {
      return null;
    }
  }

  return null;
}
