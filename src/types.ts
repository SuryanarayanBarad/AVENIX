export type AppView = 
  | 'landing' 
  | 'kiosk' 
  | 'patient-tracker' 
  | 'admin'
  | 'super-admin'
  | 'doctor'
  | 'visitor'
  | 'visitor-token'
  | 'visitor-appointment'
  | 'visitor-appointment-detail'
  | 'visitor-queue';

export type ViewMode = AppView;


import type { CommandTab } from '../lib/permissions';

/**
 * Command Center tabs. The list lives in lib/permissions.ts so the sidebar and
 * the API authorize against exactly the same definition.
 */
export type AdminTab = CommandTab;
export type { CommandTab, Role, Permission } from '../lib/permissions';

export type ServiceType = 
  | 'General Consultation'
  | 'Registration'
  | 'Billing & Discharge'
  | 'Pharmacy & Dispensing'
  | 'Specialist Appointments'
  | 'Pediatrics'
  | 'Emergency Triage'
  | 'Diagnostics'
  | 'Other Services';

export type PriorityLevel = 'Emergency' | 'Priority' | 'Normal';

export type DemographicType = 'Standard' | 'Elderly' | 'Pediatric' | 'Pregnant / Mobility' | 'Emergency';

export type TokenStatus = 'waiting' | 'approaching' | 'serving' | 'completed' | 'cancelled';

export interface Token {
  id: string;
  code: string; // e.g. A-184
  service: ServiceType;
  priority: PriorityLevel;
  demographic: DemographicType;
  patientName: string;
  issueTime: string;
  estWaitMin: number;
  peopleAhead: number;
  counterId: string; // e.g. "Counter 04"
  status: TokenStatus;
  urgencyScore: number;
  fairnessAdjustment: number; // e.g. +3 positions
  checkInMethod: 'Kiosk' | 'Online App' | 'Desk Triage' | 'Anonymous Sensor';
}

export interface Counter {
  id: string;
  name: string; // "Counter 01", etc.
  service: ServiceType;
  staffName: string;
  status: 'Active' | 'Optimal' | 'Overloaded' | 'Idle' | 'Closed';
  queueCount: number;
  avgWaitMin: number;
  servedCount: number;
  capacityMax: number;
  utilizationPct: number;
  densityLevel: 'Low' | 'Moderate' | 'High' | 'Overloaded';
}

export interface FacilityZone {
  id: string;
  name: string;
  densityPct: number;
  currentOccupancy: number;
  maxCapacity: number;
  status: 'Optimal' | 'Moderate' | 'Congested' | 'Critical';
  sensorType: 'LiDAR' | 'Thermal' | 'Hybrid Matrix';
  activeNodes: number;
  trend: 'rising' | 'stable' | 'declining';
  x: number; // For floorplan visualization (% from left)
  y: number; // For floorplan visualization (% from top)
  width: number;
  height: number;
}

export interface SensorNode {
  id: string;
  type: 'LiDAR' | 'Thermal';
  zoneId: string;
  x: number;
  y: number;
  status: 'Online' | 'Calibrating';
  activeReadings: number;
}

export interface Appointment {
  id: string;
  tokenCode: string;
  patientName: string;
  time: string;
  date: string;
  service: ServiceType;
  doctor: string;
  demographic: DemographicType;
  priority: PriorityLevel;
  status: 'Scheduled' | 'Checked In' | 'Waiting' | 'In Consultation' | 'Completed' | 'Delayed';
  estWaitMin: number;
  notes?: string;
}

export interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'recommendation' | 'info' | 'CRITICAL' | 'WARNING' | 'RECOMMENDATION' | 'INFO';
  category?: 'Crowd Surge' | 'Counter Overload' | 'Wait Increase' | 'Capacity Warning' | 'AI Recommendation';
  title: string;
  message: string;
  time?: string;
  timestamp?: string;
  status?: 'ACTIVE' | 'RESOLVED';
  zone?: string;
  counterId?: string;
  actionLabel?: string;
  actionType?: 'open_counter' | 'dispatch_support' | 'rebalance_queue' | 'apply_rec' | 'dismiss';
}

export interface PredictionPoint {
  timeSlot: string;
  historicalArrivals: number;
  predictedArrivals: number;
  predictedWaitMin: number;
  confidencePct: number;
  lowerBoundWait: number;
  upperBoundWait: number;
  crowdIndex: number;
}

export interface FairnessWeight {
  id: string;
  name: string;
  description: string;
  multiplier: number;
  active: boolean;
  category: 'Demographic' | 'Clinical' | 'Wait-Time SLA';
}

export interface DecisionLogEntry {
  id: string;
  timestamp: string;
  tokenId: string;
  action: string;
  reason: string;
  fairnessDelta: string;
  confidence: number;
}

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'ai' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  suggestedActions?: string[];
  reasoningCard?: {
    title: string;
    confidence: number;
    recommendation: string;
    impactWait: string;
    impactFairness: string;
    actionLabel?: string;
    actionKey?: string;
  };
}

export interface DoctorAppointment {
  id: string;
  code: string;
  facilityId: string;
  doctorId: string;
  patientName: string;
  phone: string;
  date: string;
  time: string;
  reasonForVisit: string;
  status: 'Pending' | 'Approved' | 'Denied' | 'Scheduled' | 'CheckedIn' | 'Waiting' | 'InConsultation' | 'Completed' | 'Delayed' | 'Cancelled' | 'Missed';
  notes?: string;
  /** Optimistic-concurrency token; send it back when changing status. */
  version?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorStats {
  // Today
  totalToday: number;
  pending: number;
  approved: number;
  completed: number;
  denied: number;
  missed: number;
  // All-time, per doctor
  totalAppointments?: number;
  approvedTotal?: number;
  deniedTotal?: number;
  pendingTotal?: number;
  completedCheckups?: number;
  todayPatients?: number;
  /** Approved / (Approved + Denied) × 100. Pending is excluded. */
  approvalRate?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Served path (e.g. /uploads/avatars/x.png) or a Google photo URL. */
  avatarUrl?: string | null;
  phone?: string | null;
  /** Present only when the account is linked to a Doctor profile. */
  doctorId?: string;
}

/** Public, patient-facing doctor card. Contains no account or contact data. */
export interface PublicDoctor {
  id: string;
  name: string;
  department: string;
  specialization?: string;
  photoUrl?: string | null;
  qualification?: string | null;
  experienceYears?: number;
  consultationFee?: number;
  bio?: string | null;
  status?: string;
}

/** Management view of a doctor — Super Admin creates/edits, Admin may read. */
export interface ManagedDoctor {
  id: string;
  name: string;
  photoUrl?: string | null;
  qualification?: string | null;
  experienceYears?: number;
  consultationFee?: number;
  bio?: string | null;
  isActive?: boolean;
  departmentId: string;
  department?: { id: string; name: string } | null;
  user?: { id: string; email: string; name: string; role: string } | null;
  createdAt?: string;
}

/** One row of the doctor's "My Patients" list. */
export interface DoctorPatient {
  id: string;
  appointmentId: string;
  tokenCode: string;
  patientName: string;
  patientAvatarUrl?: string | null;
  phoneMasked: string;
  date: string;
  time: string;
  displayTime: string;
  reasonForVisit: string;
  existingDiagnosis?: string | null;
  status: string;
  checkupStatus: string;
  queuePosition: number | null;
  queueToken?: { id: string; code: string; status: string; counterName?: string | null } | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CameraRecord {
  id: string;
  facilityId: string;
  name: string;
  location: string;
  type: 'webcam' | 'cctv' | 'rtsp';
  status: 'connected' | 'disconnected' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface CameraAnalytics {
  cameraId: string;
  timestamp: string;
  peopleCount: number;
  queueCount: number;
  zoneCounts: Record<string, number>;
  densityLevel: 'Low' | 'Medium' | 'High';
}
