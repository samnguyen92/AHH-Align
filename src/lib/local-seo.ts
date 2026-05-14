const STATE_TO_SLUG: Record<string, string> = {
  AL: 'alabama',
  AK: 'alaska',
  AZ: 'arizona',
  AR: 'arkansas',
  CA: 'california',
  CO: 'colorado',
  CT: 'connecticut',
  DE: 'delaware',
  FL: 'florida',
  GA: 'georgia',
  HI: 'hawaii',
  IL: 'illinois',
  MA: 'massachusetts',
  MD: 'maryland',
  NJ: 'new-jersey',
  NY: 'new-york',
  PA: 'pennsylvania',
  TX: 'texas',
  VA: 'virginia',
  WA: 'washington',
};

const SLUG_TO_STATE = Object.fromEntries(
  Object.entries(STATE_TO_SLUG).map(([code, slug]) => [slug, code])
);

export function slugifySegment(value: string | null | undefined) {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function unslugifySegment(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function stateToSlug(state: string | null | undefined) {
  const code = (state || '').toUpperCase();
  return STATE_TO_SLUG[code] || slugifySegment(state);
}

export function stateSlugToCode(slug: string) {
  return SLUG_TO_STATE[slug] || slug.toUpperCase();
}

export function cityRoute(state: string, city: string) {
  return `/${stateToSlug(state)}/${slugifySegment(city)}`;
}

export function specialtyRoute(state: string, city: string, specialty: string) {
  return `${cityRoute(state, city)}/${slugifySegment(specialty)}`;
}
