const UNSAFE_IMAGE_PATTERNS = [
  '/Users/',
  'source.unsplash.com',
];

export function getSafeArticleImageSrc(src?: string | null): string | null {
  const value = src?.trim();

  if (!value) return null;

  if (UNSAFE_IMAGE_PATTERNS.some((pattern) => value.includes(pattern))) {
    return null;
  }

  // Rewrite legacy Supabase storage URLs to local public paths
  if (value.includes('supabase.co/storage/v1/object/public/generated-images/')) {
    const parts = value.split('supabase.co/storage/v1/object/public/generated-images/');
    if (parts[1]) {
      return `/${parts[1]}`;
    }
  }

  if (
    value.startsWith('/generated-insights/') ||
    value.startsWith('/images/') ||
    value.startsWith('/uploads/') ||
    value.startsWith('data:image/')
  ) {
    return value;
  }

  if (value.startsWith('https://') || value.startsWith('http://')) {
    return value;
  }

  return null;
}
