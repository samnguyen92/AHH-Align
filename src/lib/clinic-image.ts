const UNSAFE_IMAGE_PATTERNS = [
  '/Users/',
  'source.unsplash.com',
  'captcha',
  'perfdrive',
  'recaptcha',
  'g-recaptcha',
  'bot-detection',
];

export const SPECIALTY_FALLBACK_IMAGES: Record<string, string> = {
  'dental': 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80',
  'primary care': '/brand/lg/primary-care.jpg',
  'family medicine': '/brand/lg/family.jpg',
  'pediatrics': '/brand/about/mission-family-care.webp',
  'acupuncture & tcm': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=800&q=80',
  'hospital': 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80',
  'ophthalmology': 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80',
  'mental health': '/brand/about/hero-language-care.webp',
  'cardiology': 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=800&q=80',
  'dermatology': 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=800&q=80',
  'orthopedics': 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80',
  'community health center': '/brand/about/step-search-directory.webp',
  'urgent care': 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=800&q=80',
};

export const DEFAULT_CLINIC_FALLBACKS = [
  '/brand/lg/primary-care.jpg',
  '/brand/lg/hero.jpg',
  '/brand/lg/family.jpg',
  '/brand/about/hero-language-care.webp',
  '/brand/about/mission-family-care.webp',
  '/brand/about/step-search-directory.webp',
];

export function getClinicFallbackImage(specialty?: string | null, seed?: string | number): string {
  if (specialty) {
    const key = specialty.toLowerCase().trim();
    for (const [k, img] of Object.entries(SPECIALTY_FALLBACK_IMAGES)) {
      if (key.includes(k) || k.includes(key)) {
        return img;
      }
    }
  }
  if (typeof seed === 'number') {
    return DEFAULT_CLINIC_FALLBACKS[Math.abs(seed) % DEFAULT_CLINIC_FALLBACKS.length];
  }
  if (typeof seed === 'string') {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
    return DEFAULT_CLINIC_FALLBACKS[Math.abs(hash) % DEFAULT_CLINIC_FALLBACKS.length];
  }
  return DEFAULT_CLINIC_FALLBACKS[0];
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
      // If it points to generated-clinics which is not local, return null to trigger specialty fallback
      if (parts[1].startsWith('generated-clinics/')) {
        return null;
      }
      return `/${parts[1]}`;
    }
  }

  // generated-clinics is not bundled locally; return null to fall back to curated specialty photography
  if (value.startsWith('/generated-clinics/')) {
    return null;
  }

  if (
    value.startsWith('/brand/') ||
    value.startsWith('/generated-insights/') ||
    value.startsWith('/images/') ||
    value.startsWith('/uploads/') ||
    value.startsWith('data:image/') ||
    value.startsWith('/')
  ) {
    return value;
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
