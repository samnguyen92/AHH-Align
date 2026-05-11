/**
 * Supabase Client — Browser (Client Components)
 * Sử dụng trong các Client Components ('use client')
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
    '(or NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
