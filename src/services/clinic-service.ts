/**
 * Clinic Service — Data access layer cho bảng clinics
 * Dùng cho Server Components & Route Handlers
 */

import { createServerAnonClient } from './supabase-server';
import type {
  Clinic,
  ClinicSearchParams,
  PaginatedResponse,
} from '@/types/database';
import {
  cityRoute,
  slugifySegment,
  specialtyRoute,
  stateToSlug,
} from '@/lib/local-seo';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Tìm kiếm phòng khám với bộ lọc: city, state, specialty, language.
 * Sử dụng Anon client (respects RLS — public SELECT).
 */
export async function searchClinics(
  params: ClinicSearchParams
): Promise<PaginatedResponse<Clinic>> {
  const supabase = createServerAnonClient();
  const page = params.page ?? 1;
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  if (!supabase) {
    return { data: [], total: 0, page, limit, hasMore: false };
  }

  try {
    // Xây dựng query cơ bản
    let query = supabase
      .from('clinics')
      .select('*', { count: 'exact' });

    // Áp dụng filters (hỗ trợ chọn nhiều cities cách nhau bởi dấu phẩy)
    if (params.city) {
      const cities = params.city
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cities.length === 1) {
        query = query.ilike('city', `%${cities[0]}%`);
      } else if (cities.length > 1) {
        if (params.query) {
          query = query.in('city', cities);
        } else {
          query = query.or(cities.map((c) => `city.ilike.%${c}%`).join(','));
        }
      }
    }
    if (params.state) {
      query = query.eq('state', params.state.toUpperCase());
    }
    if (params.specialty) {
      query = query.ilike('specialty', `%${params.specialty}%`);
    }
    if (params.language) {
      query = query.contains('languages', [params.language]);
    }
    if (params.query) {
      query = query.or(
        `name.ilike.%${params.query}%,address.ilike.%${params.query}%`
      );
    }

    // Pagination + Sắp xếp (Ưu tiên các cơ sở có rating/ranking cao lên trước)
    const { data, error, count } = await query
      .order('metadata->rating', { ascending: false, nullsFirst: false })
      .order('metadata->rating_count', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const total = count ?? 0;

    return {
      data: (data as Clinic[]) ?? [],
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    };
  } catch (err) {
    console.error('[clinic-service] searchClinics error:', err);
    return { data: [], total: 0, page, limit, hasMore: false };
  }
}

/**
 * Lấy chi tiết một phòng khám theo ID.
 */
export async function getClinicById(id: string): Promise<Clinic | null> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return data as Clinic;
  } catch (err) {
    console.error('[clinic-service] getClinicById error:', err);
    return null;
  }
}

export const SAMPLE_NEXT_HEALTH_CLINIC: Clinic = {
  id: 'next-health-org',
  org_id: null,
  name: 'Next Health',
  slug: 'next-health',
  description:
    'Next Health runs doctor-supervised longevity and proactive care clinics offering diagnostic blood panels, full-body imaging, targeted therapies, and ongoing memberships across the United States, with Vietnamese, Korean, and Chinese language support available at select metro locations.\n\nTesting happens in person, with results reviewed by a practitioner or functional medicine provider. Patients can choose comprehensive blood testing, bilingual preventive consultations, or broader executive assessments with imaging, IV therapy, hormone optimization, peptide, and metabolic weight programs.',
  address: '10250 Santa Monica Blvd, Suite 1440',
  city: 'Los Angeles',
  state: 'CA',
  zip_code: '90067',
  phone: '(310) 295-2075',
  languages: ['Vietnamese', 'Korean', 'Chinese (Mandarin)', 'English'],
  specialty: 'Longevity & Preventive Medicine',
  is_telehealth_available: true,
  claimed_by: 'next-health-verified',
  is_claimed: true,
  created_at: '2026-01-15T00:00:00.000Z',
  metadata: {
    profile_updated_at: '2026-05-07',
    founded_year: 2016,
    price_tier: '$$',
    short_description:
      'Doctor-supervised longevity and preventive care clinics offering biomarker testing, imaging, targeted therapies, and memberships with multilingual care coordinators.',
    cultural_context:
      'Bilingual care navigators in Vietnamese, Korean, and Mandarin help families review 50+ biomarker results clearly, coordinate family visits, and translate personalized wellness action plans.',
    accepting_new_patients: true,
    website: 'https://www.next-health.com',
    appointment_url: 'https://www.next-health.com/book',
    email: 'care@next-health.com',
    npi_number: '1497283910',
    rating: 4.9,
    rating_count: 8573,
    images: [
      '/brand/lg/hero.jpg',
      '/brand/lg/primary-care.jpg',
      '/brand/lg/family.jpg',
      '/brand/about/hero-language-care.webp',
      '/brand/about/mission-family-care.webp',
    ],
    working_hours: {
      monday: '9:00 AM - 7:00 PM',
      tuesday: '9:00 AM - 7:00 PM',
      wednesday: '9:00 AM - 7:00 PM',
      thursday: '9:00 AM - 7:00 PM',
      friday: '9:00 AM - 6:00 PM',
      saturday: '10:00 AM - 5:00 PM',
      sunday: '10:00 AM - 4:00 PM',
    },
    review_profile: {
      rating: 4.9,
      review_count: 8573,
      source: 'Google',
      summary:
        'Patients consistently praise the thorough biomarker reviews, unhurried 60-minute consultations, and clear bilingual explanations for older parents.',
      positive_themes: [
        'Thorough lab reviews',
        'Bilingual care navigators',
        'Clean modern clinics',
        'Clear upfront pricing',
      ],
      featured_reviews: [
        {
          source: 'google',
          author: 'Minh Nguyen',
          rating: 5,
          date: '2026-04-12',
          text: 'Brought my parents here for their baseline blood panel. Having a Vietnamese-speaking coordinator walk through every cardiovascular and metabolic marker made all the difference.',
        },
        {
          source: 'google',
          author: 'Ji-Hoon Park',
          rating: 5,
          date: '2026-03-28',
          text: 'The Core Physical uncovered thyroid and vitamin deficiencies my regular checkups missed. Upfront pricing and zero surprise billing.',
        },
        {
          source: 'google',
          author: 'Dr. Elaine Chen',
          rating: 5,
          date: '2026-03-04',
          text: 'Well-structured preventive protocol. All historical lab data stays organized in their portal so you can track progress quarter by quarter.',
        },
        {
          source: 'google',
          author: 'Hanh Tran',
          rating: 5,
          date: '2026-02-19',
          text: 'Easy online booking, calm clinic atmosphere in Century City, and the nurse practitioner took a full hour to answer our family questions.',
        },
      ],
    },
    what_to_know: [
      {
        title: 'Choose your assessment',
        detail:
          'Select a testing package and visit a clinic for in-person blood draw and diagnostics. A concierge sends preparation instructions right after booking.',
      },
      {
        title: 'Get tested and review results',
        detail:
          'Results return in 5–10 business days. Comprehensive packages include a 60–90 minute consultation and a personalized action plan with retest intervals.',
      },
    ],
    differentiators: [
      {
        title: 'Bring existing lab results',
        detail:
          'A consultation-only option lets you bring recent lab work from another clinic for an in-depth functional medicine review.',
      },
      {
        title: 'Shared family health record',
        detail:
          'Health Nexus, the patient portal, keeps every biomarker panel and imaging report together over time.',
      },
    ],
    before_you_book: [
      {
        title: 'Overnight fasting usually required',
        detail:
          'Most baseline blood panels require a 10–12 hour fast. Water and black coffee are fine unless instructed otherwise.',
      },
      {
        title: 'Pricing varies by location',
        detail:
          'Core diagnostics are available across all clinics, while select advanced therapies vary by metro.',
      },
    ],
    services_offered: [
      {
        name: 'Comprehensive Biomarker Panels',
        category: 'Diagnostics',
        description: '50+ to 500+ biomarker panels covering metabolic, cardiovascular, hormone, thyroid, and inflammation markers.',
      },
      {
        name: 'IV & NAD+ Infusions',
        category: 'Therapies',
        description: 'Physician-formulated nutrient drips and NAD+ infusions tailored to energy, immunity, and cellular recovery.',
      },
      {
        name: 'Hormone & Metabolic Optimization',
        category: 'Programs',
        description: 'Clinician-led hormone balancing and GLP-1 metabolic weight programs with ongoing lab monitoring.',
      },
      {
        name: 'Cryotherapy, Infrared & HBOT',
        category: 'Wellness Technology',
        description: 'Whole-body cryotherapy, infrared light beds, and hyperbaric oxygen sessions for recovery and sleep.',
      },
      {
        name: 'Executive Physical & Full-Body Imaging',
        category: 'Preventive Care',
        description: 'Annual comprehensive assessment combining advanced blood diagnostics, coronary calcium scan, and MRI screening.',
      },
      {
        name: 'Peptide Therapy Consultations',
        category: 'Regenerative Care',
        description: 'Physician-supervised peptide protocols after baseline lab work and medical history review.',
      },
    ],
    pricing_summary: {
      starting_price: '$250',
      starting_unit: 'mo',
      typical_annual_range: '$3,000/yr – $8,000/yr',
      payment_methods: 'Self-pay · Major credit cards · HSA/FSA accepted via Letter of Medical Necessity.',
      accepts_hsa_fsa: true,
      checked_at: '2026-10-18',
    },
    memberships: [
      {
        name: 'Optimize Membership',
        price: '$250',
        period: 'per month',
        description: 'Entry preventive membership with semi-annual lab testing and recovery sessions.',
        benefits: [
          'Baseline lab panel twice a year',
          '2 functional provider consultations/yr',
          '10 monthly wellness technology credits',
          'Monthly vitamin shot & cryotherapy',
        ],
        yearly_price: '$3,000/yr',
        cancel_anytime: true,
      },
      {
        name: 'Premier Membership',
        price: '$500',
        period: 'per month',
        description: 'Designed for patients combining quarterly diagnostics with regular IV therapy.',
        benefits: [
          '2 IV drip sessions & 2 vitamin shots/mo',
          '10 monthly wellness credits',
          'Baseline labs twice a year + 2 consults',
          '$1,000 credit when billed yearly',
        ],
        yearly_price: '$6,000/yr',
        cancel_anytime: true,
        is_featured: true,
      },
      {
        name: 'Limitless Membership',
        price: '$1,200',
        period: 'per month',
        description: 'All-inclusive concierge longevity care with unlimited wellness sessions.',
        benefits: [
          'Up to 4 IV infusions per month',
          'Unlimited wellness technology sessions',
          'Unlimited provider team access',
          'Program monitoring labs included',
        ],
        yearly_price: '$12,000/yr',
        cancel_anytime: false,
      },
    ],
    pricing: [
      {
        name: 'Baseline Blood Test (50+ biomarkers)',
        price: '$350',
        notes: 'In-clinic blood draw + results review consultation',
        category: 'Assessment',
      },
      {
        name: 'Total Baseline Test',
        price: '$999',
        notes: 'Adds cortisol, gut permeability, and cardiovascular genetic risk markers',
        category: 'Assessment',
      },
      {
        name: 'Core Physical',
        price: '$3,000',
        notes: 'Blood, micronutrient, toxin & food panels + 90-minute provider consultation',
        category: 'Executive Physical',
      },
      {
        name: 'The Executive Physical (500+ biomarkers)',
        price: '$15,000',
        notes: 'Full-year program with MRI/CT imaging, Galleri cancer screening, genetics & quarterly follow-ups',
        category: 'Executive Physical',
      },
    ],
    care_model: {
      engagement: ['Ongoing Membership', 'One-Time Assessment'],
      free_consultation: true,
      telehealth: true,
      interpreter_available: true,
      mobile_app: true,
      provider_count: 14,
    },
    diagnostics: [
      {
        name: 'Baseline Test',
        price_from: '$349',
        setting: 'in_clinic',
        detail: '50+ biomarkers',
        description: 'Entry-level in-clinic blood panel covering hormones, thyroid, metabolic health, and inflammation.',
      },
      {
        name: 'At-Home Baseline Test',
        price_from: '$499',
        setting: 'at_home',
        detail: '~30 biomarkers',
        description: 'Upper-arm EasyDraw kit with cardiometabolic markers and virtual provider review.',
      },
      {
        name: 'Galleri Multi-Cancer Early Detection',
        price_from: '$1,185',
        setting: 'in_clinic',
        detail: '50+ cancer signals',
        description: 'Screens for shared cancer signals in a single blood draw with results in ~14 days.',
      },
      {
        name: 'Executive Physical',
        price_from: '$15,000',
        setting: 'in_clinic',
        detail: '500+ biomarkers + MRI/CT',
        description: 'Comprehensive full-body longevity assessment with quarterly follow-up care.',
      },
    ],
    insurance: {
      accepted_networks: ['Self-Pay', 'HSA / FSA (via Truemed)', 'Out-of-Network Superbill'],
      accepts_medicare: false,
      accepts_medicaid: false,
      accepts_private_insurance: false,
      notes: 'Diagnostic lab panels and memberships are self-pay with upfront pricing; HSA/FSA funds are accepted with a Letter of Medical Necessity.',
    },
    opening_locations: ['Irvine, CA', 'San Diego, CA', 'Las Vegas, NV', 'Miami Beach, FL'],
    locations: [
      {
        name: 'Century City, Los Angeles',
        address: '10250 Santa Monica Blvd, Suite 1440',
        city: 'Los Angeles',
        state: 'CA',
        status: 'open',
        description: 'Flagship Westside clinic inside Westfield Century City offering full diagnostics, IV therapy, and HBOT.',
        highlights: ['Vietnamese & Korean coordinators', 'Walk-ins welcome', 'Validated parking'],
      },
      {
        name: 'West Hollywood, CA',
        address: '8464 Melrose Place',
        city: 'West Hollywood',
        state: 'CA',
        status: 'open',
        description: 'Original founding center with full lab testing, cryotherapy, infrared, and hormone programs.',
        highlights: ['Founding location', 'NICU-trained IV nurses'],
      },
      {
        name: 'Bellevue, WA',
        address: '10425 NE 8th St, Lincoln Square North',
        city: 'Bellevue',
        state: 'WA',
        status: 'open',
        description: 'Pacific Northwest hub serving Seattle–Bellevue families with Mandarin and Korean language support.',
        highlights: ['Mandarin & Korean support', 'Latest weekday hours'],
      },
      {
        name: 'Elk Grove / Sacramento, CA',
        address: '7470 Elk Grove Blvd',
        city: 'Elk Grove',
        state: 'CA',
        status: 'open',
        description: 'Northern California center offering baseline panels, executive physicals, and memberships.',
        highlights: ['Vietnamese care navigator', 'Appointment only'],
      },
      {
        name: 'Irvine, CA (Orange County)',
        address: '8599 Irvine Center Drive',
        city: 'Irvine',
        state: 'CA',
        status: 'opening_soon',
        description: 'Upcoming Orange County clinic near Little Saigon and Irvine Spectrum.',
        highlights: ['Vietnamese, Korean & Mandarin staff', 'Opening soon'],
      },
      {
        name: 'San Diego, CA',
        address: '4545 La Jolla Village Dr',
        city: 'San Diego',
        state: 'CA',
        status: 'opening_soon',
        description: 'Planned UTC clinic bringing longevity diagnostics and therapies to San Diego.',
        highlights: ['Opening soon'],
      },
    ],
    team_members: [
      {
        name: 'Dr. Darshan Shah, MD',
        role: 'Founder & Chief Medical Officer',
        languages_spoken: ['English'],
        bio_snippet: 'Board-certified surgeon and functional medicine specialist with 20+ years of clinical experience.',
      },
      {
        name: 'Dr. Linh Pham, DO',
        role: 'Lead Longevity Physician (SoCal)',
        languages_spoken: ['Vietnamese', 'English'],
        bio_snippet: 'Focuses on cardiometabolic prevention, hormone balance, and bilingual family consultations.',
      },
      {
        name: 'Dr. Soo-Jin Kim, NP',
        role: 'Functional Medicine Practitioner',
        languages_spoken: ['Korean', 'English'],
        bio_snippet: 'Specializes in thyroid, metabolic health, and longevity biomarker interpretation.',
      },
      {
        name: 'Dr. Kevin Wu, MD',
        role: 'Preventive Cardiology Advisor',
        languages_spoken: ['Chinese (Mandarin)', 'English'],
        bio_snippet: 'Guides advanced lipid, ApoB, and coronary imaging protocols across West Coast locations.',
      },
    ],
    faqs: [
      {
        question: 'Can I book a single blood test without joining a monthly membership?',
        answer: 'Yes. Anyone can book the Baseline Test ($350), Total Baseline Test ($999), or Core Physical ($3,000) as a one-time assessment without a membership.',
      },
      {
        question: 'Is Vietnamese, Korean, or Mandarin interpretation available during my results review?',
        answer: 'Yes. When booking at our Los Angeles, Orange County, Sacramento, or Bellevue locations—or via telehealth—request a Vietnamese, Korean, or Mandarin-speaking clinician or care navigator at no extra cost.',
      },
      {
        question: 'Can I use HSA or FSA funds?',
        answer: 'Yes. Eligible diagnostic panels and preventive memberships can be paid with HSA/FSA cards after a brief medical necessity review through Truemed.',
      },
      {
        question: 'How long does it take to get my biomarker results back?',
        answer: 'Standard Baseline and Core Physical blood panels return in 5 to 10 business days, followed by your 1-on-1 provider consultation.',
      },
    ],
    licenses: [
      'Medical Board of California',
      'CLIA-Certified Partner Labs',
      'American Board of Surgery',
      'Institute for Functional Medicine (IFM)',
    ],
  },
};

/**
 * Lấy chi tiết một phòng khám theo Slug.
 */
export async function getClinicBySlug(slug: string): Promise<Clinic | null> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return slug === 'next-health' ? SAMPLE_NEXT_HEALTH_CLINIC : null;
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data && slug === 'next-health') {
      return SAMPLE_NEXT_HEALTH_CLINIC;
    }

    return data as Clinic;
  } catch (err) {
    console.error('[clinic-service] getClinicBySlug error:', err);
    return slug === 'next-health' ? SAMPLE_NEXT_HEALTH_CLINIC : null;
  }
}

/**
 * Lấy danh sách ngôn ngữ unique có trong hệ thống (cho filter dropdown).
 */
export async function getAvailableLanguages(): Promise<string[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('languages');

    if (error) {
      throw error;
    }

    // Flatten mảng languages từ tất cả clinics, loại bỏ trùng lặp
    const allLanguages = (data ?? []).flatMap(
      (row: { languages: string[] }) => row.languages
    );
    const uniqueLanguages = [...new Set(allLanguages)].sort();

    return uniqueLanguages;
  } catch (err) {
    console.error('[clinic-service] getAvailableLanguages error:', err);
    return [];
  }
}

export interface ClinicSitemapEntry {
  slug: string;
  created_at: string;
}

export interface CitySeoCombo {
  city: string;
  state: string;
  stateSlug: string;
  citySlug: string;
  clinicCount: number;
  path: string;
}

export interface SpecialtySeoCombo extends CitySeoCombo {
  specialty: string;
  specialtySlug: string;
}

export async function getClinicSitemapEntries(limit = 50000): Promise<ClinicSitemapEntry[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('slug,created_at')
      .not('slug', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return ((data ?? []) as ClinicSitemapEntry[]).filter((clinic) => clinic.slug);
  } catch (err) {
    console.error('[clinic-service] getClinicSitemapEntries error:', err);
    return [];
  }
}

export async function getTopCityCombos(limit = 200): Promise<CitySeoCombo[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('city,state')
      .not('city', 'is', null)
      .not('state', 'is', null)
      .limit(5000);

    if (error) throw error;

    const counts = new Map<string, CitySeoCombo>();

    for (const clinic of (data ?? []) as Pick<Clinic, 'city' | 'state'>[]) {
      if (!clinic.city || !clinic.state) continue;

      const key = `${clinic.state.toUpperCase()}|${clinic.city.toLowerCase()}`;
      const existing = counts.get(key);

      if (existing) {
        existing.clinicCount += 1;
        continue;
      }

      counts.set(key, {
        city: clinic.city,
        state: clinic.state.toUpperCase(),
        stateSlug: stateToSlug(clinic.state),
        citySlug: slugifySegment(clinic.city),
        clinicCount: 1,
        path: cityRoute(clinic.state, clinic.city),
      });
    }

    return [...counts.values()]
      .sort((a, b) => b.clinicCount - a.clinicCount)
      .slice(0, limit);
  } catch (err) {
    console.error('[clinic-service] getTopCityCombos error:', err);
    return [];
  }
}

export async function getTopSpecialtyCombos(limit = 1000): Promise<SpecialtySeoCombo[]> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('city,state,specialty')
      .not('city', 'is', null)
      .not('state', 'is', null)
      .not('specialty', 'is', null)
      .limit(5000);

    if (error) throw error;

    const counts = new Map<string, SpecialtySeoCombo>();

    for (const clinic of (data ?? []) as Pick<Clinic, 'city' | 'state' | 'specialty'>[]) {
      if (!clinic.city || !clinic.state || !clinic.specialty) continue;

      const key = `${clinic.state.toUpperCase()}|${clinic.city.toLowerCase()}|${clinic.specialty.toLowerCase()}`;
      const existing = counts.get(key);

      if (existing) {
        existing.clinicCount += 1;
        continue;
      }

      counts.set(key, {
        city: clinic.city,
        state: clinic.state.toUpperCase(),
        stateSlug: stateToSlug(clinic.state),
        citySlug: slugifySegment(clinic.city),
        specialty: clinic.specialty,
        specialtySlug: slugifySegment(clinic.specialty),
        clinicCount: 1,
        path: specialtyRoute(clinic.state, clinic.city, clinic.specialty),
      });
    }

    return [...counts.values()]
      .sort((a, b) => b.clinicCount - a.clinicCount)
      .slice(0, limit);
  } catch (err) {
    console.error('[clinic-service] getTopSpecialtyCombos error:', err);
    return [];
  }
}

export interface FilterOption {
  value: string;
  count: number;
}

export interface CityFilterOption extends FilterOption {
  state: string;
}

export interface SearchFilterOptions {
  specialties: FilterOption[];
  languages: FilterOption[];
  cities: CityFilterOption[];
}

const ASIAN_LANGUAGES = new Set([
  'Vietnamese',
  'Korean',
  'Chinese',
  'Japanese',
  'Tagalog',
  'Hindi',
  'Mandarin',
  'Cantonese',
  'Toisanese',
  'Thai',
  'Bengali',
  'Punjabi',
  'Urdu',
  'Tamil',
  'Telugu',
  'Gujarati'
]);

export async function getSearchFilterOptions(): Promise<SearchFilterOptions> {
  const supabase = createServerAnonClient();

  if (!supabase) {
    return { specialties: [], languages: [], cities: [] };
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('specialty, languages, city, state');

    if (error) {
      throw error;
    }

    const specialtyCounts: Record<string, number> = {};
    const languageCounts: Record<string, number> = {};
    const cityCounts: Record<string, { state: string; count: number }> = {};

    (data ?? []).forEach((clinic) => {
      // 1. Specialty
      if (clinic.specialty) {
        const spec = clinic.specialty.trim();
        specialtyCounts[spec] = (specialtyCounts[spec] || 0) + 1;
      }

      // 2. Languages
      if (clinic.languages && Array.isArray(clinic.languages)) {
        clinic.languages.forEach((lang: string) => {
          if (lang) {
            const l = lang.trim();
            // Normalize case to title case just in case
            const normalizedLang = l.charAt(0).toUpperCase() + l.slice(1).toLowerCase();
            if (ASIAN_LANGUAGES.has(normalizedLang)) {
              languageCounts[normalizedLang] = (languageCounts[normalizedLang] || 0) + 1;
            }
          }
        });
      }

      // 3. City
      if (clinic.city && clinic.state) {
        const city = clinic.city.trim();
        const state = clinic.state.trim().toUpperCase();
        const key = `${city}, ${state}`;
        if (!cityCounts[key]) {
          cityCounts[key] = { state, count: 0 };
        }
        cityCounts[key].count += 1;
      }
    });

    const specialties = Object.entries(specialtyCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    const languages = Object.entries(languageCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    const cities = Object.entries(cityCounts)
      .map(([key, item]) => {
        const city = key.substring(0, key.indexOf(','));
        return { value: city, state: item.state, count: item.count };
      })
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    return { specialties, languages, cities };
  } catch (err) {
    console.error('[clinic-service] getSearchFilterOptions error:', err);
    return { specialties: [], languages: [], cities: [] };
  }
}

