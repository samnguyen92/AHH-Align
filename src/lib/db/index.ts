/**
 * src/lib/db/index.ts — Unified Database Access Layer for Asian Health Hub.
 * Connects directly to self-hosted PostgreSQL 16 with pgvector via node-postgres pool.
 */

import { createPostgresClient } from './postgres';

export { getPool, createPostgresClient } from './postgres';

export function getDb() {
  return createPostgresClient();
}

// Backward-compatibility aliases during migration
export function createServerSupabaseClient() {
  return createPostgresClient() as any;
}

export function createServerAnonClient() {
  return createPostgresClient() as any;
}
