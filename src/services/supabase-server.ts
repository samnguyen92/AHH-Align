import { createPostgresClient } from '@/lib/db/postgres';

export function createServerSupabaseClient() {
  return createPostgresClient() as any;
}

export function createServerAnonClient() {
  return createPostgresClient() as any;
}
