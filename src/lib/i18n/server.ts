import { cookies } from 'next/headers';
import { LOCALE_COOKIE, parseLocale, type SupportedLocale } from './index';

export async function getServerLocale(): Promise<SupportedLocale> {
  try {
    const store = await cookies();
    const raw = store.get(LOCALE_COOKIE)?.value;
    return parseLocale(raw);
  } catch {
    return 'en';
  }
}
