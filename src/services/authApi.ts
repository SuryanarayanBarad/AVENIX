import { User, AuthResponse } from '../types';
import { apiFetch, parseResponse, AUTH_TIMEOUT_MS } from './apiClient';

const API_BASE = '/api/auth';

export const authApi = {
  async register(data: any): Promise<AuthResponse> {
    const result = await apiFetch<AuthResponse>(`${API_BASE}/register`, {
      method: 'POST',
      body: JSON.stringify(data),
      auth: false,
      fallback: 'Registration failed',
      timeoutMs: AUTH_TIMEOUT_MS,
      retryOnTimeout: true,
    });
    localStorage.setItem('auth_token', result.token);
    return result;
  },

  async login(data: any): Promise<AuthResponse> {
    const result = await apiFetch<AuthResponse>(`${API_BASE}/login`, {
      method: 'POST',
      body: JSON.stringify(data),
      auth: false,
      fallback: 'Login failed',
      timeoutMs: AUTH_TIMEOUT_MS,
      retryOnTimeout: true,
    });
    localStorage.setItem('auth_token', result.token);
    return result;
  },

  async googleLogin(idToken: string): Promise<AuthResponse> {
    const result = await apiFetch<AuthResponse>(`${API_BASE}/google`, {
      method: 'POST',
      body: JSON.stringify({ idToken }),
      auth: false,
      fallback: 'Google login failed',
      timeoutMs: AUTH_TIMEOUT_MS,
      retryOnTimeout: true,
    });
    localStorage.setItem('auth_token', result.token);
    return result;
  },

  async googleGetAuthUrl(): Promise<{ url: string; state: string }> {
    return apiFetch<{ url: string; state: string }>(`${API_BASE}/google/url`, {
      auth: false,
      fallback: 'Google sign-in is not available',
      timeoutMs: AUTH_TIMEOUT_MS,
      retryOnTimeout: true,
    });
  },

  async verify(): Promise<{ user: User }> {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('No token found');

    const res = await fetch(`${API_BASE}/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      },
    });

    // Only a genuine auth rejection clears the session. A 5xx or a dropped
    // connection must not sign the user out — that turns a blip into a logout.
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('auth_token');
      throw new Error('Your session has expired. Please sign in again.');
    }

    return parseResponse<{ user: User }>(res, 'Could not verify your session');
  },

  /**
   * Sign out.
   *
   * Tells the server first so the token is revoked rather than merely
   * forgotten, then clears local state. The local clear happens whatever the
   * server says: if the request fails, the user still expects to be signed out
   * on this device, and leaving the token in localStorage after they pressed
   * "log out" would be the worse outcome.
   */
  async logout(): Promise<void> {
    // Clear locally FIRST, synchronously. The revoke call is not awaited by the
    // caller, so clearing afterwards could race a user who signs straight back
    // in — the late removal would delete their new token instead of the old one.
    const token = localStorage.getItem('auth_token');
    localStorage.removeItem('auth_token');
    if (!token) return;

    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Offline, or the server is asleep. The device is signed out either way;
      // the token simply keeps its remaining lifetime until it expires.
    }
  }
};

/**
 * Profile API — the signed-in user's own display profile.
 * The account is resolved from the JWT server-side, so there is no user id to
 * pass and no way to read or edit somebody else's profile from here.
 */
export const profileApi = {
  async get(): Promise<{ user: User }> {
    return apiFetch<{ user: User }>('/api/profile', { fallback: 'Could not load your profile' });
  },

  /** `photo` is a base64 data URL; the server validates type/size and stores the file. */
  async update(data: { name?: string; phone?: string | null; photo?: string; removePhoto?: boolean }): Promise<{ user: User }> {
    return apiFetch<{ user: User }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
      fallback: 'Could not save your profile',
    });
  },
};
