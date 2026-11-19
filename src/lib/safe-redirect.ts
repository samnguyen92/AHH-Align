/**
 * Returns `next` only when it is a same-site relative path.
 * Rejects protocol-relative URLs ("//evil.example"), backslash tricks ("/\evil"),
 * absolute URLs and control characters, which would otherwise be open redirects.
 */
export function safeNextPath(next: string | null | undefined, fallback: string | null = null): string | null {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) {
    return fallback;
  }

  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }

  if (/[\u0000-\u001f\u007f]/.test(next)) {
    return fallback;
  }

  return next;
}
