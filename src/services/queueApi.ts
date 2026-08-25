import type { AppointmentRequest, DoctorOption, PublicAppointment } from '../components/AppointmentFlow';
import type { PublicQueueToken, VisitorServiceOption, WalkInTokenRequest } from '../components/VisitorFlow';
import type { PublicDoctor } from '../types';
import { apiFetch, authHeaders } from './apiClient';
import { serviceDayKey } from '../../lib/serviceDay';

const TOKEN_KEY_PREFIX = 'queuemind:visitor-token:';
const APPOINTMENT_KEY_PREFIX = 'queuemind:visitor-appointment:';

type ApiErrorPayload = { error?: string; message?: string };

const getStoredKey = (prefix: string, id: string) => {
  try {
    return window.localStorage.getItem(`${prefix}${id}`) ?? '';
  } catch {
    return '';
  }
};

const storeKey = (prefix: string, id: string, accessKey?: string) => {
  if (!accessKey) return;
  try {
    window.localStorage.setItem(`${prefix}${id}`, accessKey);
  } catch {
    // Tracking still works for the current session even when storage is unavailable.
  }
};

const request = <T>(path: string, init: RequestInit = {}): Promise<T> =>
  apiFetch<T>(path, {
    ...init,
    auth: false,
    fallback: 'The facility service could not complete your request',
  }).catch((error: any) => {
    // Slot collisions get a plain-language message instead of a raw 409.
    if (error?.status === 409) {
      throw new Error('That appointment time is no longer available. Please choose another time.');
    }
    throw error;
  });

const mapAppointment = (raw: any, accessKey?: string): PublicAppointment => ({
  id: raw.id,
  appointmentId: raw.appointmentId ?? raw.tokenCode ?? raw.id,
  doctorId: raw.doctorId ?? '',
  doctor: raw.doctor,
  department: raw.department,
  date: raw.date,
  time: raw.time,
  patientName: raw.patientName,
  reasonForVisit: raw.reasonForVisit ?? 'Your visit details are protected.',
  phoneMasked: raw.phoneMasked ?? raw.maskedPhone ?? '••••••••',
  // Pass the server's own wording through. Collapsing unknown values to
  // "Confirmed" used to tell patients an unapproved request was confirmed.
  status: (raw.status ?? 'Confirmed') as PublicAppointment['status'],
  lifecycleStatus: raw.lifecycleStatus,
  awaitingApproval: raw.awaitingApproval ?? raw.lifecycleStatus === 'Pending',
  accessKey,
  notification: raw.notification,
});

export const visitorApi = {
  async getServices(): Promise<VisitorServiceOption[]> {
    const result = await request<{ services: VisitorServiceOption[] }>('/api/visitor/services');
    return result.services;
  },

  async createToken(input: WalkInTokenRequest): Promise<PublicQueueToken> {
    const token = await request<PublicQueueToken & { accessKey?: string }>('/api/visitor/tokens', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: {
        'Authorization': `Bearer ${window.localStorage.getItem('auth_token') || ''}`,
      }
    });
    storeKey(TOKEN_KEY_PREFIX, token.id, token.accessKey);
    return token;
  },

  async getMyActiveToken(): Promise<PublicQueueToken | null> {
    try {
      const result = await request<{ token: PublicQueueToken | null }>('/api/visitor/my-token', {
        headers: {
          'Authorization': `Bearer ${window.localStorage.getItem('auth_token') || ''}`,
        }
      });
      return result.token;
    } catch {
      return null;
    }
  },

  async getToken(tokenId: string, accessKey?: string): Promise<PublicQueueToken> {
    const key = accessKey || getStoredKey(TOKEN_KEY_PREFIX, tokenId);
    const authHeader = window.localStorage.getItem('auth_token');
    if (!key && !authHeader) throw new Error('This private token link is missing its access key or authentication.');
    
    let url = `/api/visitor/tokens/${encodeURIComponent(tokenId)}`;
    if (key) url += `?accessKey=${encodeURIComponent(key)}`;
    
    const result = await request<PublicQueueToken>(url, {
      headers: authHeader ? { 'Authorization': `Bearer ${authHeader}` } : undefined
    });
    return result;
  },

  /** Correct your own token. Changing service re-queues you at the back. */
  async updateToken(tokenId: string, changes: { name?: string; phone?: string; serviceId?: string }): Promise<PublicQueueToken & { requeued?: boolean }> {
    const key = getStoredKey(TOKEN_KEY_PREFIX, tokenId);
    const authHeader = window.localStorage.getItem('auth_token');
    let url = `/api/visitor/tokens/${encodeURIComponent(tokenId)}`;
    if (key) url += `?accessKey=${encodeURIComponent(key)}`;
    return request<PublicQueueToken & { requeued?: boolean }>(url, {
      method: 'PATCH',
      body: JSON.stringify(changes),
      headers: authHeader ? { Authorization: `Bearer ${authHeader}` } : undefined,
    });
  },

  /**
   * Confirm the consultation is finished. Frees the slot and, if this token was
   * the one being served, calls the next person forward.
   */
  async completeToken(tokenId: string): Promise<{ completed: PublicQueueToken; calledNext: { code: string } | null; wasBeingServed?: boolean }> {
    const key = getStoredKey(TOKEN_KEY_PREFIX, tokenId);
    const authHeader = window.localStorage.getItem('auth_token');
    let url = `/api/visitor/tokens/${encodeURIComponent(tokenId)}/complete`;
    if (key) url += `?accessKey=${encodeURIComponent(key)}`;
    return request(url, {
      method: 'POST',
      headers: authHeader ? { Authorization: `Bearer ${authHeader}` } : undefined,
    });
  },

  /** Give up your place in the queue. A new token starts at the back. */
  async cancelToken(tokenId: string): Promise<{ cancelled: boolean; id: string }> {
    const key = getStoredKey(TOKEN_KEY_PREFIX, tokenId);
    const authHeader = window.localStorage.getItem('auth_token');
    let url = `/api/visitor/tokens/${encodeURIComponent(tokenId)}`;
    if (key) url += `?accessKey=${encodeURIComponent(key)}`;
    return request<{ cancelled: boolean; id: string }>(url, {
      method: 'DELETE',
      headers: authHeader ? { Authorization: `Bearer ${authHeader}` } : undefined,
    });
  },

  async getQueuePosition(tokenId: string, accessKey?: string): Promise<any> {
    const key = accessKey || getStoredKey(TOKEN_KEY_PREFIX, tokenId);
    const authHeader = window.localStorage.getItem('auth_token');
    if (!key && !authHeader) throw new Error('This private token link is missing its access key or authentication.');
    
    let url = `/api/visitor/tokens/${encodeURIComponent(tokenId)}/queue-position`;
    if (key) url += `?accessKey=${encodeURIComponent(key)}`;

    const result = await request<any>(url, {
      headers: authHeader ? { 'Authorization': `Bearer ${authHeader}` } : undefined
    });
    return result;
  },

  async getDoctors(date: string): Promise<DoctorOption[]> {
    const result = await request<{ doctors: DoctorOption[] }>(`/api/visitor/doctors?date=${encodeURIComponent(date)}`);
    return result.doctors;
  },

  /** Every specialization the facility has, with its assigned doctor count. */
  async getSpecializations(): Promise<{ id: string; name: string; doctorCount: number }[]> {
    const result = await request<{ specializations: { id: string; name: string; doctorCount: number }[] }>(
      '/api/visitor/specializations',
    );
    return result.specializations;
  },

  /** The signed-in patient's own bookings. Scoped server-side by account. */
  async getMyAppointments(): Promise<any[]> {
    const result = await apiFetch<{ appointments: any[] }>('/api/visitor/my-appointments', {
      fallback: 'Your appointments could not be loaded',
    });
    return result.appointments;
  },

  /** Appointments and walk-in visits together — the full visit history. */
  async getMyVisitHistory(): Promise<{ appointments: any[]; visits: any[] }> {
    const result = await apiFetch<{ appointments: any[]; visits: any[] }>('/api/visitor/my-appointments', {
      fallback: 'Your visit history could not be loaded',
    });
    return { appointments: result.appointments ?? [], visits: result.visits ?? [] };
  },

  /** Public doctor directory (photo, specialization, experience). No account data. */
  async getDoctorDirectory(date?: string): Promise<PublicDoctor[]> {
    const day = date ?? serviceDayKey();
    const result = await request<{ doctors: PublicDoctor[] }>(`/api/visitor/doctors?date=${encodeURIComponent(day)}`);
    return result.doctors;
  },

  async getAvailableTimes(doctorId: string, date: string): Promise<string[]> {
    const result = await request<{ availableTimes: string[] }>(`/api/visitor/doctors/${encodeURIComponent(doctorId)}/availability?date=${encodeURIComponent(date)}`);
    return result.availableTimes;
  },

  async createAppointment(input: AppointmentRequest): Promise<PublicAppointment> {
    const raw = await request<any>('/api/visitor/appointments', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const appointment = mapAppointment(raw, raw.accessKey);
    storeKey(APPOINTMENT_KEY_PREFIX, appointment.appointmentId, raw.accessKey);
    storeKey(APPOINTMENT_KEY_PREFIX, appointment.id, raw.accessKey);
    return appointment;
  },

  async getAppointment(appointmentId: string, accessKey?: string): Promise<PublicAppointment> {
    const key = accessKey || getStoredKey(APPOINTMENT_KEY_PREFIX, appointmentId);
    if (!key) throw new Error('This private appointment link is missing its access key.');
    const raw = await request<any>(`/api/visitor/appointments/${encodeURIComponent(appointmentId)}?accessKey=${encodeURIComponent(key)}`);
    const appointment = mapAppointment(raw, key);
    storeKey(APPOINTMENT_KEY_PREFIX, appointment.appointmentId, key);
    storeKey(APPOINTMENT_KEY_PREFIX, appointment.id, key);
    return appointment;
  },

  async requestAnotherAppointmentTime(appointment: PublicAppointment): Promise<PublicAppointment> {
    const accessKey = appointment.accessKey || getStoredKey(APPOINTMENT_KEY_PREFIX, appointment.appointmentId) || getStoredKey(APPOINTMENT_KEY_PREFIX, appointment.id);
    if (!accessKey) throw new Error('This private appointment link is missing its access key.');
    const raw = await request<any>(`/api/visitor/appointments/${encodeURIComponent(appointment.appointmentId)}/reschedule-request`, {
      method: 'POST',
      body: JSON.stringify({ accessKey }),
    });
    return mapAppointment({ ...appointment, ...raw }, accessKey);
  },
};

// Admin calls are authenticated with the session JWT (see services/apiClient).
// The server derives the caller's role from that token; the browser never
// asserts its own role.

export interface AdminScheduleAppointment {
  id: string;
  tokenCode: string;
  patientName: string;
  phoneMasked?: string;
  time: string;
  date: string;
  service: string;
  doctor: string;
  doctorId?: string;
  status: string;
  estWaitMin: number;
  reasonForVisit?: string;
}

export const adminApi = {
  /** The facility's appointments, pending first. Staff only. */
  async getAppointments(params: { date?: string; status?: string; search?: string } = {}) {
    const query = new URLSearchParams();
    if (params.date) query.set('date', params.date);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    const suffix = query.toString() ? `?${query}` : '';
    return apiFetch<{ appointments: any[]; pendingCount: number }>(`/api/admin/appointments${suffix}`, {
      fallback: 'Appointments could not be loaded',
    });
  },

  /** Approve, deny or advance an appointment as staff. Audited. */
  async setAppointmentStatus(
    appointmentId: string,
    status: string,
    opts: { reasonId?: string; reasonNote?: string; expectedVersion?: number } = {},
  ) {
    return apiFetch<{ appointment: { id: string; code: string; status: string; statusReason: string | null; version: number; inQueue: boolean } }>(
      `/api/admin/appointments/${encodeURIComponent(appointmentId)}/status`,
      { method: 'POST', body: JSON.stringify({ status, ...opts }), fallback: 'The appointment could not be updated' },
    );
  },

  /**
   * Edit a queue entry as staff.
   *
   * The visitor route proves ownership with the holder's private access key,
   * which staff do not have and should not need — they run the board. This is
   * the audited route: every change lands in the audit log the Super Admin's
   * queue-activity feed reads, so an administrator cannot alter somebody's
   * place unobserved.
   */
  async updateTokenAsStaff(tokenId: string, changes: { name?: string; phone?: string; serviceId?: string }) {
    // The two routes name the same field differently — `name` for the holder,
    // `visitorName` for staff — so sending the visitor shape here silently
    // changed nothing and came back "there is nothing to change on this token".
    const { name, ...rest } = changes;
    return apiFetch<any>(`/api/admin/tokens/${encodeURIComponent(tokenId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...rest, ...(name !== undefined ? { visitorName: name } : {}) }),
      fallback: 'The queue entry could not be updated',
    });
  },

  /** Remove a queue entry as staff. Soft delete, audited. */
  async deleteTokenAsStaff(tokenId: string, reason?: string) {
    return apiFetch<{ deleted: boolean; code: string }>(`/api/admin/tokens/${encodeURIComponent(tokenId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
      fallback: 'The queue entry could not be removed',
    });
  },

  async getTokens(search?: string): Promise<any> {
    const url = search ? `/api/admin/tokens?search=${encodeURIComponent(search)}` : '/api/admin/tokens';
    const result = await request<{ tokens: any[] }>(url, { headers: authHeaders() });
    return result.tokens;
  },

  async getDoctorSchedule(date: string): Promise<any> {
    return request(`/api/admin/doctor-schedule?date=${encodeURIComponent(date)}`, { headers: authHeaders() });
  },

  async updateDoctorAvailability(doctorId: string, availability: Record<string, unknown>): Promise<any> {
    return request(`/api/admin/doctors/${encodeURIComponent(doctorId)}/availability`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(availability),
    });
  },

  async rescheduleAppointment(appointmentId: string, payload: Record<string, unknown>): Promise<any> {
    return request(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/reschedule`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  },

  /** Read-only doctor directory for ADMIN / MANAGER / SUPER_ADMIN. */
  async getDoctors(): Promise<{ doctors: any[]; canManage: boolean }> {
    return request(`/api/admin/doctors`, { headers: authHeaders() });
  },
};

export const accessKeys = {
  getToken: (id: string) => getStoredKey(TOKEN_KEY_PREFIX, id),
  getAppointment: (id: string) => getStoredKey(APPOINTMENT_KEY_PREFIX, id),
};
