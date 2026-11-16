import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'ahh_super_secret_auth_key_2026_self_hosted';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SessionPayload {
  userId: string;
  email?: string | null;
  role?: string | null;
  exp: number;
}

export function createSessionToken(user: { id: string; email?: string | null; role?: string | null }): string {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email || null,
    role: user.role || null,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    // For backward compatibility during migration, if token is directly a UUID:
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(token)) {
      return {
        userId: token,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
      };
    }
    return null;
  }

  const [payloadBase64, providedSignature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  try {
    const isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(providedSignature),
      Buffer.from(expectedSignature)
    );
    if (!isSignatureValid) {
      return null;
    }

    const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload: SessionPayload = JSON.parse(jsonStr);

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
