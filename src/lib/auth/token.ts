import crypto from 'crypto';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MIN_SECRET_LENGTH = 32;

// Only used outside production so local `npm run dev` works without extra setup.
// It is never used when NODE_ENV === 'production'.
const DEV_ONLY_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

/**
 * Resolve the signing secret lazily (at sign/verify time, not at import time)
 * so `next build` does not fail when the variable is missing at build time.
 * In production a strong AUTH_SECRET is mandatory.
 */
function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET || '';

  if (process.env.NODE_ENV === 'production') {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `AUTH_SECRET must be set to a random string of at least ${MIN_SECRET_LENGTH} characters in production.`
      );
    }
    return secret;
  }

  return secret || DEV_ONLY_SECRET;
}

export interface SessionPayload {
  userId: string;
  email?: string | null;
  role?: string | null;
  exp: number;
}

function sign(payloadBase64: string): string {
  return crypto.createHmac('sha256', getAuthSecret()).update(payloadBase64).digest('base64url');
}

export function createSessionToken(user: { id: string; email?: string | null; role?: string | null }): string {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email || null,
    role: user.role || null,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadBase64}.${sign(payloadBase64)}`;
}

/**
 * Verify a signed session token. Returns null for anything that is not a
 * correctly signed, unexpired token. A bare user id (UUID) is NOT a valid token.
 */
export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, providedSignature] = parts;

  try {
    const expected = Buffer.from(sign(payloadBase64));
    const provided = Buffer.from(providedSignature);

    // timingSafeEqual throws when lengths differ, so compare lengths first.
    if (expected.length !== provided.length || !crypto.timingSafeEqual(provided, expected)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8')) as SessionPayload;

    if (typeof payload.userId !== 'string' || !payload.userId) {
      return null;
    }

    // Reject tokens with a missing or past expiry.
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
