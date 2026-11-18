import registry from './languages.json';

/**
 * Language registry helpers. The data lives in languages.json (shared with the Python scrapers),
 * so adding a new language is a one-entry change there – no other code needs to be touched.
 */

interface LanguageEntry {
  name: string;
  family: string;
  aliases: string[];
  native?: string;
  generic?: boolean;
  directory?: boolean;
}

const ENTRIES = registry.languages as LanguageEntry[];

const BY_NAME = new Map(ENTRIES.map((e) => [e.name.toLowerCase(), e]));
const BY_ALIAS = new Map<string, LanguageEntry>();
for (const entry of ENTRIES) {
  BY_ALIAS.set(entry.name.toLowerCase(), entry);
  for (const alias of entry.aliases) BY_ALIAS.set(alias.toLowerCase(), entry);
}

/** Canonical language name for a raw value ("Chinese (Mandarin)", "tiếng việt", "粵語"), or null if unknown. */
export function normalizeLanguage(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return null;
  const exact = BY_ALIAS.get(value);
  if (exact) return exact.name;

  // "Chinese (Mandarin)", "Mandarin/Cantonese": prefer the most specific (non-generic) variant that appears.
  const hits = ENTRIES.filter((e) => [e.name, ...e.aliases].some((a) => value.includes(a.toLowerCase())));
  const specific = hits.find((e) => !e.generic) ?? hits[0];
  return specific?.name ?? null;
}

/**
 * Split a raw value like "Mandarin/Cantonese" and normalise each part.
 * Unknown values are dropped (scraped data) unless keepUnknown is set (owner/admin input), in which case they are
 * kept title-cased so a language we have not registered yet is never lost.
 */
export function normalizeLanguageList(raw: unknown, options: { keepUnknown?: boolean } = {}): string[] {
  const out: string[] = [];
  const parts = Array.isArray(raw) ? raw : [];
  for (const item of parts) {
    for (const piece of String(item ?? '').split(/[,/;&]|\band\b/i)) {
      const trimmed = piece.trim();
      const name =
        normalizeLanguage(trimmed) ??
        (options.keepUnknown && trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase() : null);
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

/** Directory facet a language belongs to (Mandarin/Cantonese -> Chinese). */
export function languageFamily(raw: string | null | undefined): string | null {
  const name = normalizeLanguage(raw);
  return name ? (BY_NAME.get(name.toLowerCase())?.family ?? name) : null;
}

/** Every canonical name in a family, e.g. Chinese -> [Chinese, Mandarin, Cantonese, ...]. */
export function familyMembers(family: string): string[] {
  const key = (languageFamily(family) ?? family).toLowerCase();
  return ENTRIES.filter((e) => e.family.toLowerCase() === key).map((e) => e.name);
}

/** Distinct directory families for a clinic's language list. */
export function clinicFamilies(languages: readonly string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const raw of languages ?? []) {
    const family = languageFamily(raw);
    if (family) out.add(family);
  }
  return [...out];
}

/** Families that are shown as directory facets (excludes English/Spanish). */
export function isDirectoryFamily(family: string): boolean {
  return ENTRIES.some((e) => e.family === family && e.directory);
}

export function languageNative(family: string): string | undefined {
  return BY_NAME.get(family.toLowerCase())?.native;
}

/**
 * Values to match in clinics.languages for a directory filter. A family name ("Chinese") matches every variant
 * (Chinese, Mandarin, Cantonese, ...); a specific variant ("Cantonese") matches only itself.
 */
export function expandLanguageFilter(raw: string): string[] {
  const name = normalizeLanguage(raw);
  if (!name) return [raw.trim()].filter(Boolean);
  const entry = BY_NAME.get(name.toLowerCase());
  return entry && entry.family === entry.name ? familyMembers(entry.family) : [name];
}
