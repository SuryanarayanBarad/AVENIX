import { CameraRecord, CameraAnalytics } from '../types';
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : { 'X-QueueMind-Role': 'manager' }) // Fallback to mock header if no token
  };
};

export const cameraApi = {
  async getCameras(): Promise<CameraRecord[]> {
    const res = await fetch('/api/admin/cameras', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch cameras');
    return res.json();
  },

  async connectCamera(data: { name: string; location: string; type: string }): Promise<CameraRecord> {
    const res = await fetch('/api/admin/cameras/connect', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to connect camera');
    return res.json();
  },

  async disconnectCamera(cameraId: string): Promise<CameraRecord> {
    const res = await fetch('/api/admin/cameras/disconnect', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ cameraId }),
    });
    if (!res.ok) throw new Error('Failed to disconnect camera');
    return res.json();
  },

  async getCameraStatus(cameraId: string): Promise<CameraRecord> {
    const res = await fetch(`/api/admin/cameras/${cameraId}/status`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch camera status');
    return res.json();
  },

  async getCameraAnalytics(cameraId: string): Promise<CameraAnalytics[]> {
    const res = await fetch(`/api/admin/cameras/${cameraId}/analytics`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch camera analytics');
    return res.json();
  },

  async postCameraAnalytics(cameraId: string, data: Omit<CameraAnalytics, 'cameraId' | 'timestamp'>): Promise<CameraAnalytics> {
    const res = await fetch(`/api/admin/cameras/${cameraId}/analytics`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to post camera analytics');
    return res.json();
  }
};
