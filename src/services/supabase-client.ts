import { getAuthToken, clearAuthToken } from '@/lib/auth/session-cookie';

type AuthStateChangeCallback = (event: string, session: any) => void;
const listeners = new Set<AuthStateChangeCallback>();

export function notifyAuthStateChange(event: string, session: any) {
  listeners.forEach((cb) => {
    try {
      cb(event, session);
    } catch (e) {
      console.error('[supabase-client] auth listener error:', e);
    }
  });
}

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
    onAuthStateChange(callback: AuthStateChangeCallback) {
      listeners.add(callback);
      // Trigger initial callback asynchronously to match Supabase behavior
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          const token = getAuthToken();
          if (token) {
            callback('INITIAL_SESSION', { access_token: token, user: null });
          } else {
            callback('INITIAL_SESSION', null);
          }
        }, 0);
      }
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(callback);
            },
          },
        },
      };
    },
    async updateUser(updates: any) {
      const token = getAuthToken();
      if (!token) return { data: { user: null }, error: new Error('Unauthorized') };
      try {
        const res = await fetch('/api/auth/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updates),
        });
        const data = await res.json();
        return { data: { user: data.user }, error: res.ok ? null : new Error(data.error) };
      } catch (err: any) {
        return { data: { user: null }, error: err };
      }
    },
    async signOut() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // ignore
      }
      clearAuthToken();
      notifyAuthStateChange('SIGNED_OUT', null);
      return { error: null };
    },
  },
};
