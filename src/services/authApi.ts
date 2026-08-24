import { User, AuthResponse } from '../types';
import { apiFetch, parseResponse } from './apiClient';

const API_BASE = '/api/auth';

export const authApi = {
  async register(data: any): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await parseResponse<AuthResponse>(res, 'Registration failed');
    localStorage.setItem('auth_token', result.token);
    return result;
  },

  async login(data: any): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await parseResponse<AuthResponse>(res, 'Login failed');
    localStorage.setItem('auth_token', result.token);
    return result;
  },

  async googleLogin(idToken: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const result = await parseResponse<AuthResponse>(res, 'Google login failed');
    localStorage.setItem('auth_token', result.token);
    return result;
  },

  async googleGetAuthUrl(): Promise<{ url: string; state: string }> {
    const res = await fetch(`${API_BASE}/google/url`);
    return parseResponse<{ url: string; state: string }>(res, 'Google sign-in is not available');
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

  logout() {
    localStorage.removeItem('auth_token');
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
