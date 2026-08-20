import type { AppointmentRequest, DoctorOption, PublicAppointment } from '../components/AppointmentFlow';
import type { PublicQueueToken, VisitorServiceOption, WalkInTokenRequest } from '../components/VisitorFlow';

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

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({} as ApiErrorPayload));
  if (!response.ok) {
    const detail = (payload as ApiErrorPayload).message || (payload as ApiErrorPayload).error;
    if (response.status === 409) throw new Error('That appointment time is no longer available. Please choose another time.');
    throw new Error(detail || 'The facility service could not complete your request.');
  }
  return payload as T;
};

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
  status: raw.status === 'Scheduled' ? 'Scheduled' : raw.status === 'Updated' ? 'Updated' : raw.status === 'Cancelled' ? 'Cancelled' : 'Confirmed',
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
    });
    storeKey(TOKEN_KEY_PREFIX, token.id, token.accessKey);
    return token;
  },

  async getToken(tokenId: string, accessKey?: string): Promise<PublicQueueToken> {
    const key = accessKey || getStoredKey(TOKEN_KEY_PREFIX, tokenId);
    if (!key) throw new Error('This private token link is missing its access key.');
    const result = await request<PublicQueueToken>(`/api/visitor/tokens/${encodeURIComponent(tokenId)}?accessKey=${encodeURIComponent(key)}`);
    return result;
  },

  async getDoctors(date: string): Promise<DoctorOption[]> {
    const result = await request<{ doctors: DoctorOption[] }>(`/api/visitor/doctors?date=${encodeURIComponent(date)}`);
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

const staffHeaders = { 'X-QueueMind-Role': 'manager' };

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
  async getDoctorSchedule(date: string): Promise<any> {
    return request(`/api/admin/doctor-schedule?date=${encodeURIComponent(date)}`, { headers: staffHeaders });
  },

  async updateDoctorAvailability(doctorId: string, availability: Record<string, unknown>): Promise<any> {
    return request(`/api/admin/doctors/${encodeURIComponent(doctorId)}/availability`, {
      method: 'PATCH',
      headers: staffHeaders,
      body: JSON.stringify(availability),
    });
  },

  async rescheduleAppointment(appointmentId: string, payload: Record<string, unknown>): Promise<any> {
    return request(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/reschedule`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify(payload),
    });
  },
};

export const accessKeys = {
  getToken: (id: string) => getStoredKey(TOKEN_KEY_PREFIX, id),
  getAppointment: (id: string) => getStoredKey(APPOINTMENT_KEY_PREFIX, id),
};
