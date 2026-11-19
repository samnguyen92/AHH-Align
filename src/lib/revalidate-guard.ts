import { timingSafeEqual } from 'node:crypto';

// Decides whether a "refresh these pages" request from the OpenClaw bot is allowed. Pure on purpose: easy to test.
const PATH_RE = /^\/[a-zA-Z0-9\-_./]{0,200}$/;
const MAX_PATHS = 10;
const MIN_SECRET_LENGTH = 16;

export type RevalidateDecision =
  | { ok: true; paths: string[] }
  | { ok: false; status: 400 | 404 };

function secretsMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkRevalidateRequest(givenSecret: string, expectedSecret: string, paths: unknown): RevalidateDecision {
  // Disabled (404, as if the route did not exist) unless a long secret is configured and presented.
  if (expectedSecret.length < MIN_SECRET_LENGTH || !secretsMatch(givenSecret, expectedSecret)) {
    return { ok: false, status: 404 };
  }
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.length > MAX_PATHS ||
    !paths.every((p) => typeof p === 'string' && PATH_RE.test(p) && !p.includes('//') && !p.includes('..'))
  ) {
    return { ok: false, status: 400 };
  }
  return { ok: true, paths: paths as string[] };
}
