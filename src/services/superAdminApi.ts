import { User, ManagedDoctor, CameraRecord, CameraAnalytics } from '../types';
import { apiFetch } from './apiClient';

const API_BASE = '/api/super-admin';

const request = <T>(path: string, init: RequestInit = {}, fallback = 'The super admin request failed') =>
  apiFetch<T>(`${API_BASE}${path}`, { ...init, fallback });

export const superAdminApi = {
  async getDashboardStats() {
    return request<any>('/dashboard');
  },

  async getUsers() {
    return request<User[]>('/users');
  },

  async updateUserRole(userId: string, role: string) {
    return request<User>(`/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  /** Queue edits made by administrators — the Super Admin's review feed. */
  async getQueueActivity(hours = 24) {
    return request<{
      sinceHours: number;
      total: number;
      unreviewed: number;
      activity: any[];
    }>(`/queue-activity?hours=${hours}`);
  },

  async getAuditLogs() {
    return request<any[]>('/audit-logs');
  },

  async getDepartments() {
    return request<{ id: string; name: string }[]>('/departments');
  },

  async getDoctors() {
    return request<ManagedDoctor[]>('/doctors');
  },

  /** Correct a specialization's name. Doctors stay attached to it. */
  async renameDepartment(id: string, name: string) {
    return request<{ id: string; name: string }>(`/departments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  /** Remove a specialization. Refused while any doctor still belongs to it. */
  async deleteDepartment(id: string) {
    return request<{ deleted: boolean; name: string }>(`/departments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async createDepartment(name: string) {
    return request<{ id: string; name: string }>('/departments', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  /** `photo` is a base64 data URL; the server validates and stores the file. */
  async createDoctor(data: Record<string, unknown>) {
    return request<ManagedDoctor>('/doctors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateDoctor(id: string, data: Record<string, unknown>) {
    return request<ManagedDoctor>(`/doctors/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteDoctor(id: string) {
    return request<{ deleted?: boolean; deactivated?: boolean; message?: string }>(`/doctors/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
};
