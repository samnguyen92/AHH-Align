import { getAuthToken, clearAuthToken } from '@/lib/auth/session-cookie';

export const supabase = {
  auth: {
    async getSession() {
      const token = getAuthToken();
      if (!token) {
        return { data: { session: null }, error: null };
      }
      return {
        data: {
          session: {
            access_token: token,
          },
        },
        error: null,
      };
    },
    async getUser() {
      const token = getAuthToken();
      if (!token) return { data: { user: null }, error: null };
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return { data: { user: null }, error: null };
        const data = await res.json();
        return { data: { user: data.user }, error: null };
      } catch {
        return { data: { user: null }, error: null };
      }
    },
    async signOut() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // ignore
      }
      clearAuthToken();
      return { error: null };
    },
  },
};
