export type AppView = 
  | 'landing' 
  | 'kiosk' 
  | 'patient-tracker' 
  | 'admin'
  | 'visitor'
  | 'visitor-token'
  | 'visitor-appointment'
  | 'visitor-appointment-detail';

export type ViewMode = AppView;


export type AdminTab = 
  | 'overview'
  | 'live-queue'
  | 'crowd-intel'
  | 'ai-predictions'
  | 'counter-opt'
  | 'appointments'
  | 'doctor-schedule'
  | 'fairness'
  | 'analytics'
  | 'alerts'
  | 'settings';

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
