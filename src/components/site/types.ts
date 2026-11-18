import type { Clinic } from '@/types/database';

// Client-safe data shapes for the site pages (the loaders live in src/lib/site-data.ts).

export type HomeCounts = { total: number; vi: number; ko: number; zh: number };

export type HomeClinic = {
  id: string;
  name: string;
  slug: string;
  specialty: string;
  place: string;
  rating: string | null;
  reviews: number;
  langs: string[];
  telehealth: boolean;
  image: string | null;
  fallback: string;
};

export type HomeData = {
  counts: HomeCounts;
  specialties: { name: string; count: number; href: string }[];
  clinics: HomeClinic[];
  states: { code: string; name: string; count: number; href: string }[];
  cities: { name: string; state: string; count: number; href: string }[];
  guides: { title: string; category: string; slug: string; excerpt: string; image: string | null; fallback: string }[];
};

export type DirectoryParams = {
  query?: string;
  language?: string;
  specialty?: string;
  city?: string;
  state?: string;
  insurance?: string;
  telehealth?: string;
  acceptingNew?: string;
  openWeekend?: string;
  minRating?: string;
  priceTier?: string;
  sort?: 'rating' | 'reviews' | 'quality' | 'newest';
  page?: string;
};

export type DirClinic = {
  id: string;
  slug: string;
  name: string;
  specialty: string;
  place: string;
  rating: string | null;
  reviews: number;
  langs: string[];
  telehealth: boolean;
  accepting: boolean | null;
  image: string | null;
  fallback: string;
};

export type DirectoryData = {
  params: DirectoryParams;
  page: number;
  total: number;
  totalPages: number;
  pageSize: number;
  clinics: DirClinic[];
  languages: { value: string; native: string; lang: string; count: number }[];
  specialties: { value: string; count: number }[];
  states: { value: string; name: string; count: number }[];
  cities: { value: string; state: string; count: number }[];
};

export type ClinicPageData = {
  clinic: Clinic;
  photo: string | null;
  photos: string[];
  photoFallback: string;
  langs: string[];
  similar: DirClinic[];
};
