import { apiFetch, authHeaders } from './apiClient';

/**
 * AI health navigation — the patient's own reports and suggestions.
 *
 * Every route behind this is scoped to the signed-in account server-side, so
 * there is no user id to pass and no way to ask for somebody else's records
 * from here.
 */

export interface MedicalReportView {
  id: string;
  title: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  reportDate: string | null;
  uploadedAt: string;
  /** Whether readable text came out of the file. */
  hasText: boolean;
  /** Why it did not, when it did not. */
  extractionNote: string | null;
}

export interface RecommendedDoctor {
  id: string;
  name: string;
  department: string;
  qualification: string | null;
  experienceYears: number;
  consultationFee: number;
  status: string;
  scheduleKnown: boolean;
  queueDepth: number;
  freeSlotsToday: number;
  estimatedWaitMinutes: number;
  reasons: string[];
}

export interface NavigationResult {
  navigationId: string;
  department: { id: string; name: string } | null;
  suggestedDepartment: string | null;
  /** The model named a department this facility does not have. */
  unmatched: boolean;
  reason: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
  urgent: boolean;
  suggestedQuestions: string[];
  doctors: RecommendedDoctor[];
  failed: boolean;
  failureReason: string | null;
  /** Which model answered. Shown so the UI never overclaims. */
  model: string | null;
  disclaimer: string;
  reportUsed: { id: string; title: string; hadText: boolean } | null;
  reportTextUnavailable: boolean;
  reportExtractionNote: string | null;
}

export interface NavigationHistoryItem {
  id: string;
  createdAt: string;
  symptoms: string | null;
  department: { id: string; name: string } | null;
  suggestedDepartment: string | null;
  reasoning: string | null;
  confidence: string | null;
  model: string | null;
  failed: boolean;
  report: { id: string; title: string } | null;
}

export interface ForecastHorizon {
  minutes: number;
  projectedQueue: number;
  expectedArrivals: number;
  scheduledArrivals: number;
  projectedWaitMinutes: number;
  risk: 'low' | 'moderate' | 'high' | 'critical';
}

export interface CrowdForecastResponse {
  forecast: {
    basis: 'observed' | 'thin-data' | 'insufficient-data';
    basisNote: string;
    observationWindowMinutes: number;
    currentQueue: number;
    arrivalRatePerMin: number;
    serviceRatePerMin: number;
    netGrowthPerMin: number;
    currentWaitMinutes: number;
    horizons: ForecastHorizon[];
    peakRisk: 'low' | 'moderate' | 'high' | 'critical';
    recommendations: { id: string; priority: number; action: string; reason: string; actionable: boolean }[];
  };
  /** 'queueing-model' — deliberately NOT branded as AI; it is arithmetic. */
  method: string;
  methodLabel: string;
  generatedAt: string;
  capacity?: { openCounters: number; idleCounters: number };
  departmentLoad?: { service: string; counter?: string | null; waiting: number }[];
}

/** Read a File into the base64 data URL the API expects. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

export const healthApi = {
  async listReports(): Promise<{ reports: MedicalReportView[]; storage: string }> {
    return apiFetch('/api/visitor/reports', {
      headers: authHeaders(),
      fallback: 'Your reports could not be loaded',
    });
  },

  async uploadReport(input: {
    title: string; kind?: string; reportDate?: string | null; file: string;
  }): Promise<{ report: MedicalReportView }> {
    return apiFetch('/api/visitor/reports', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
      fallback: 'That report could not be uploaded',
    });
  },

  async deleteReport(id: string): Promise<{ deleted: boolean }> {
    return apiFetch(`/api/visitor/reports/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
      fallback: 'That report could not be removed',
    });
  },

  /**
   * Opening a report goes through the API, which checks ownership and then
   * either redirects to a short-lived signed URL or streams the bytes. There is
   * no public link to a medical document anywhere in this system.
   */
  reportFileUrl(id: string): string {
    return `/api/visitor/reports/${encodeURIComponent(id)}/file`;
  },

  async navigate(input: { symptoms?: string; reportId?: string }): Promise<NavigationResult> {
    return apiFetch('/api/visitor/ai/navigate', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
      fallback: 'The health navigator could not answer',
    });
  },

  async history(): Promise<{ navigations: NavigationHistoryItem[]; disclaimer: string }> {
    return apiFetch('/api/visitor/ai/navigations', {
      headers: authHeaders(),
      fallback: 'Your previous suggestions could not be loaded',
    });
  },

  async crowdForecast(): Promise<CrowdForecastResponse> {
    return apiFetch('/api/crowd/forecast', {
      headers: authHeaders(),
      fallback: 'The crowd forecast could not be loaded',
    });
  },

  /** Operations view. Requires analytics:read; 403 for everyone else. */
  async adminCrowd(): Promise<CrowdForecastResponse> {
    return apiFetch('/api/admin/crowd', {
      headers: authHeaders(),
      fallback: 'The crowd operations view could not be loaded',
    });
  },
};
