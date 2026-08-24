import { DoctorPatient, DoctorStats, ManagedDoctor, Token } from '../types';
import type { DoctorAppointment } from '../types';
import { apiFetch } from './apiClient';

const API_BASE = '/api/doctor';

/**
 * Doctor API client.
 *
 * No doctorId is ever sent from the browser: every endpoint resolves the doctor
 * from the JWT server-side, so these calls can only ever return the signed-in
 * doctor's own patients, queue, and statistics.
 */
const request = <T>(path: string, init: RequestInit = {}) =>
  apiFetch<T>(`${API_BASE}${path}`, { ...init, fallback: 'The doctor request failed' });

export const doctorApi = {
  async getAppointments(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const result = await request<{ appointments: DoctorAppointment[] }>(`/appointments${query}`);
    return result.appointments;
  },

  async getPatients(scope: 'today' | 'upcoming' | 'all' = 'today') {
    const result = await request<{ patients: DoctorPatient[]; total: number }>(`/patients?scope=${scope}`);
    return result;
  },

  /** Live queue tokens for this doctor only — same shape the tracker already renders. */
  async getQueue(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const result = await request<{ tokens: Token[] }>(`/queue${query}`);
    return result.tokens;
  },

  async getStats() {
    const result = await request<{ stats: DoctorStats }>('/stats');
    return result.stats;
  },

  async getMyProfile() {
    const result = await request<{ doctor: ManagedDoctor }>('/me');
    return result.doctor;
  },

  async updateMyProfile(data: Record<string, unknown>) {
    const result = await request<{ doctor: ManagedDoctor }>('/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return result.doctor;
  },

  /**
   * Change one of this doctor's appointments.
   * `expectedVersion` is the row version the UI was showing: if someone else
   * moved the appointment in the meantime the server answers 409 rather than
   * letting one decision silently overwrite another.
   */
  async updateAppointmentStatus(
    appointmentId: string,
    status: string,
    expectedVersion?: number,
    denial?: { reasonId: string; reasonNote?: string },
  ) {
    return request<{ appointment: DoctorAppointment }>(`/appointments/${encodeURIComponent(appointmentId)}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        ...(expectedVersion !== undefined ? { expectedVersion } : {}),
        ...(denial ? { reasonId: denial.reasonId, reasonNote: denial.reasonNote } : {}),
      }),
    });
  },

  /** Denial reasons, served by the API so the UI never hardcodes them. */
  async getDenialReasons() {
    const result = await request<{ reasons: { id: string; label: string }[] }>('/denial-reasons');
    return result.reasons;
  },
};
