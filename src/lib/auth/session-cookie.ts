export const AUTH_COOKIE_NAME = 'ahh-access-token';

export function persistAuthToken(token: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
}

export function clearAuthToken() {
  document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
