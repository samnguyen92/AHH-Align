import { NextRequest, NextResponse } from 'next/server';

const SUPPORTED_METROS: Record<string, { city: string; state: string }> = {
  'los angeles': { city: 'Los Angeles', state: 'CA' },
  'irvine': { city: 'Los Angeles', state: 'CA' },
  'garden grove': { city: 'Los Angeles', state: 'CA' },
  'westminster': { city: 'Los Angeles', state: 'CA' },
  'anaheim': { city: 'Los Angeles', state: 'CA' },
  'san jose': { city: 'San Jose', state: 'CA' },
  'santa clara': { city: 'San Jose', state: 'CA' },
  'sunnyvale': { city: 'San Jose', state: 'CA' },
  'milpitas': { city: 'San Jose', state: 'CA' },
  'san francisco': { city: 'San Francisco', state: 'CA' },
  'oakland': { city: 'San Francisco', state: 'CA' },
  'daly city': { city: 'San Francisco', state: 'CA' },
  'houston': { city: 'Houston', state: 'TX' },
  'sugar land': { city: 'Houston', state: 'TX' },
  'bellaire': { city: 'Houston', state: 'TX' },
  'dallas': { city: 'Dallas', state: 'TX' },
  'plano': { city: 'Dallas', state: 'TX' },
  'garland': { city: 'Dallas', state: 'TX' },
  'seattle': { city: 'Seattle', state: 'WA' },
  'bellevue': { city: 'Seattle', state: 'WA' },
  'san diego': { city: 'San Diego', state: 'CA' },
  'sacramento': { city: 'Sacramento', state: 'CA' },
  'elk grove': { city: 'Sacramento', state: 'CA' },
  'atlanta': { city: 'Atlanta', state: 'GA' },
  'duluth': { city: 'Atlanta', state: 'GA' },
};

export async function GET(req: NextRequest) {
  const rawCity =
    req.headers.get('x-vercel-ip-city') ||
    req.headers.get('cf-ipcity') ||
    req.headers.get('x-appengine-city') ||
    '';
  const rawRegion =
    req.headers.get('x-vercel-ip-country-region') ||
    req.headers.get('cf-region-code') ||
    '';

  let decodedCity = '';
  try {
    decodedCity = decodeURIComponent(rawCity).trim();
  } catch {
    decodedCity = rawCity.trim();
  }

  const normalized = decodedCity.toLowerCase();
  const matchedMetro = SUPPORTED_METROS[normalized] ?? null;

  return NextResponse.json(
    {
      detectedCity: decodedCity || null,
      detectedRegion: rawRegion || null,
      suggestedMetro: matchedMetro?.city ?? null,
      suggestedState: matchedMetro?.state ?? null,
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=3600',
      },
    }
  );
}

