'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import {
  LOCALE_COOKIE,
  LOCALES,
  parseLocale,
  getUiStrings,
  type SupportedLocale,
  type UiDictionary,
} from './index';

interface LocaleContextValue {
  locale: SupportedLocale;
  setLocale: (next: SupportedLocale) => void;
  t: UiDictionary;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: getUiStrings('en'),
});

function readCookieLocale(): SupportedLocale | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return match ? parseLocale(decodeURIComponent(match[1])) : null;
}

export function LocaleProvider({
  initialLocale = 'en',
  children,
}: {
  initialLocale?: SupportedLocale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);
  const router = useRouter();

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const urlLang = sp.get('lang');
    const cookieLang = readCookieLocale();
    const resolved = urlLang ? parseLocale(urlLang) : cookieLang ?? initialLocale;
    if (resolved !== locale) {
      setLocaleState(resolved);
    }
    if (urlLang) {
      document.cookie = `${LOCALE_COOKIE}=${resolved}; path=/; max-age=31536000; SameSite=Lax`;
    }
    document.documentElement.lang = resolved;
  }, [initialLocale, locale]);

  const setLocale = (next: SupportedLocale) => {
    setLocaleState(next);
    if (typeof document !== 'undefined') {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.lang = next;
    }
    router.refresh();
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: getUiStrings(locale) }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export function LanguageSwitcher({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { locale, setLocale } = useLocale();
  const isDark = variant === 'dark';

  return (
    <div
      role="group"
      aria-label="Select language"
      className={`inline-flex items-center gap-0.5 rounded-full p-1 text-xs font-semibold ${
        isDark
          ? 'bg-white/10 text-white ring-1 ring-white/15'
          : 'bg-stone-100 text-[#0D1F1C] ring-1 ring-[#0D1F1C]/10'
      }`}
    >
      <Globe className="ml-1.5 mr-0.5 h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      {LOCALES.map((item) => {
        const active = locale === item.code;
        return (
          <button
            key={item.code}
            type="button"
            onClick={() => setLocale(item.code)}
            aria-pressed={active}
            title={item.label}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              active
                ? isDark
                  ? 'bg-white font-bold text-[#0D1F1C]'
                  : 'bg-[#024E44] font-bold text-white'
                : isDark
                  ? 'text-white/75 hover:bg-white/10 hover:text-white'
                  : 'text-[#0D1F1C]/75 hover:bg-white'
            }`}
          >
            {item.short}
          </button>
        );
      })}
    </div>
  );
}
