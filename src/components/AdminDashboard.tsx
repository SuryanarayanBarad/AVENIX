import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Bell,
  Search,
  Sparkles,
  ExternalLink,
  Activity
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { AdminOverview } from './AdminOverview';
import { LiveQueueView } from './LiveQueueView';
import { CrowdIntelligenceView } from './CrowdIntelligenceView';
import { AIPredictionsView } from './AIPredictionsView';
import { CounterOptimizationView } from './CounterOptimizationView';
import { AppointmentsView, type StaffAppointment } from './AppointmentsView';
import { DoctorScheduleView } from './DoctorScheduleView';
import { FairnessLogicView } from './FairnessLogicView';
import { AnalyticsView } from './AnalyticsView';
import { CameraMonitorView } from './CameraMonitorView';
import { CopilotDrawer } from './CopilotDrawer';
import { MyVisitView } from './command/MyVisitView';
import { HealthNavigatorView } from './command/HealthNavigatorView';
import { MyPatientsView } from './command/MyPatientsView';
import { RequestsView } from './command/RequestsView';
import { DoctorDirectoryView } from './command/DoctorDirectoryView';
import { UsersRolesView } from './command/UsersRolesView';
import { AuditLogView } from './command/AuditLogView';
import { canAccessTab, defaultTabForRole } from '../../lib/permissions';
import { adminApi } from '../services/queueApi';
import {
  AdminTab,
  User,
  Counter,
  FacilityZone,
  PredictionPoint,
  Token,
  Appointment,
  FairnessWeight,
  DecisionLogEntry,
  SensorNode,
  AlertItem
} from '../types';

interface AdminDashboardProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  counters: Counter[];
  zones: FacilityZone[];
  sensors: SensorNode[];
  predictions: PredictionPoint[];
  tokens: Token[];
  appointments: StaffAppointment[];
  fairnessWeights: FairnessWeight[];
  decisionLogs: DecisionLogEntry[];
  alerts: AlertItem[];
  onUpdateToken: (token: Token) => void;
  onAddToken: (token: Token) => void;
  /** Signals the appointment list changed; the shell re-reads it. */
  onUpdateAppointment: (appointment?: unknown) => void;
  onAddAppointment: (appointment?: unknown) => void;
  onUpdateFairnessWeight: (id: string, multiplier: number) => void;
  onApplyCounterOptimization: (updatedCounters: Counter[]) => void;
  onNavigateToKiosk: () => void;
  onNavigateToVisitorTracker: () => void;
  /** Decides which tabs exist and which data each one loads. */
  user?: User | null;
}

interface SearchResult {
  id: string;
  category: 'Patient' | 'Appointment' | 'Counter' | 'AI rule';
  title: string;
  detail: string;
  tab: AdminTab;
}

const panelEase = [0.22, 1, 0.36, 1] as const;

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentTab,
  onSelectTab,
  counters,
  zones,
  sensors,
  predictions,
  tokens,
  appointments,
  fairnessWeights,
  decisionLogs,
  alerts,
  onUpdateToken,
  onAddToken,
  onUpdateAppointment,
  onAddAppointment,
  onUpdateFairnessWeight,
  onApplyCounterOptimization,
  onNavigateToKiosk,
  onNavigateToVisitorTracker,
  user = null,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<string | undefined>(undefined);
  const [recommendationApplied, setRecommendationApplied] = useState(false);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Below lg the sidebar drops to its icon rail so the content keeps room to
  // breathe; the manual collapse toggle stays in charge on wider screens.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const sync = (event: MediaQueryList | MediaQueryListEvent) => setIsCompactViewport(event.matches);
    sync(query);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const railCollapsed = sidebarCollapsed || isCompactViewport;

  const role = user?.role ?? null;
  const isDoctor = role === 'DOCTOR';
  const canManageDoctors = role === 'SUPER_ADMIN';

  // If the current tab is not available to this role (a role change, or a stale
  // selection), fall back to that role's home tab. The API refuses the data
  // either way; this just keeps the screen coherent.
  useEffect(() => {
    if (!role) return;
    if (!canAccessTab(role, currentTab)) {
      onSelectTab(defaultTabForRole(role));
    }
  }, [role, currentTab, onSelectTab]);

  const searchResults = useMemo<SearchResult[]>(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) return [];

    const matches = (...values: Array<string | number | undefined>) =>
      values.some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery));

    return [
      ...tokens
        .filter((token) => matches(token.code, token.patientName, token.service, token.counterId, token.status))
        .map((token) => ({
          id: `token-${token.id}`,
          category: 'Patient' as const,
          title: `${token.code} · ${token.patientName}`,
          detail: `${token.service} · ${token.counterId}`,
          tab: 'live-queue' as const,
        })),
      ...appointments
        .filter((appointment) => matches(appointment.patientName, appointment.code, appointment.doctor, appointment.department, appointment.status))
        .map((appointment) => ({
          id: `appointment-${appointment.id}`,
          category: 'Appointment' as const,
          title: `${appointment.patientName} · ${appointment.code}`,
          detail: `${appointment.doctor} · ${appointment.time}`,
          tab: 'appointments' as const,
        })),
      ...counters
        .filter((counter) => matches(counter.name, counter.staffName, counter.service, counter.status))
        .map((counter) => ({
          id: `counter-${counter.id}`,
          category: 'Counter' as const,
          title: counter.name,
          detail: `${counter.service} · ${counter.staffName}`,
          tab: 'counter-opt' as const,
        })),
      ...fairnessWeights
        .filter((weight) => matches(weight.name, weight.description, weight.category))
        .map((weight) => ({
          id: `rule-${weight.id}`,
          category: 'AI rule' as const,
          title: weight.name,
          detail: weight.description,
          tab: 'fairness' as const,
        })),
    ].slice(0, 8);
  }, [appointments, counters, fairnessWeights, searchQuery, tokens]);

  const handleOpenCopilotWithPrompt = (prompt?: string) => {
    setCopilotInitialPrompt(prompt);
    setIsCopilotOpen(true);
  };

  const handleSearchResultSelect = (result: SearchResult) => {
    onSelectTab(result.tab);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleApplyRecommendation = () => {
    setRecommendationApplied(true);
    const updated = counters.map(c => {
      if (c.id === 'c5') {
        return {
          ...c,
          status: 'Active' as const,
          service: 'General Consultation' as any,
          queueCount: 10,
          avgWaitMin: 9,
          utilizationPct: 65,
        };
      }
      if (c.id === 'c1') {
        return {
          ...c,
          queueCount: 14,
          avgWaitMin: 9,
          status: 'Optimal' as const,
          utilizationPct: 62,
        };
      }
      return c;
    });
    onApplyCounterOptimization(updated);
  };

  const handleAdminAction = async (action: string, payload: any) => {
    try {
      if (action === 'appointment.reschedule.approved') {
        const result = await adminApi.rescheduleAppointment(payload.appointmentId, payload);
        // The server decides the new time, doctor and status. Guessing them
        // here is what let the board show a reschedule that never happened, so
        // the list is re-read from the response instead.
        onUpdateAppointment();
        return result;
      }
      return null;
    } catch (error) {
      console.error('Admin action failed:', error);
      throw error;
    }
  };

  return (
    <div className="pc flex h-[calc(100vh-4rem)] overflow-hidden bg-[var(--pc-page)] text-[var(--pc-text)]">

      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={onSelectTab}
        collapsed={railCollapsed}
        onToggleCollapse={isCompactViewport ? undefined : () => setSidebarCollapsed(!sidebarCollapsed)}
        role={role}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 min-w-0 flex-col overflow-x-hidden">

        {/* Top Operational Bar (Frosted Glass Header) */}
        <header className="shrink-0 bg-[var(--pc-surface)] border-b border-[var(--pc-border)] px-4 sm:px-6 py-3 flex items-center justify-between gap-3 z-20">

          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-[var(--pc-text-subtle)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search patient, token, doctor, counter, or AI rule..."
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                onBlur={() => setShowSearchResults(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setShowSearchResults(false);
                    event.currentTarget.blur();
                  }

                  if (event.key === 'Enter' && searchResults[0]) {
                    event.preventDefault();
                    handleSearchResultSelect(searchResults[0]);
                  }
                }}
                role="combobox"
                aria-label="Search hospital records"
                aria-autocomplete="list"
                aria-controls="hospital-search-results"
                aria-expanded={showSearchResults && Boolean(searchQuery.trim())}
                className="pc-input w-full pl-10 pr-4 py-2 text-[13px]"
              />

              {showSearchResults && searchQuery.trim() && (
                <div
                  id="hospital-search-results"
                  role="listbox"
                  className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-md border border-[var(--pc-border)] bg-[var(--pc-surface)] p-2 text-[13px] shadow-lg"
                >
                  {searchResults.length > 0 ? (
                    <div className="space-y-1">
                      {searchResults.map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          role="option"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSearchResultSelect(result)}
                          className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[var(--pc-page)] cursor-pointer"
                        >
                          <span className="mt-0.5 shrink-0 rounded-full border border-[#2E37A4]/40 bg-[#2E37A4]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#b4aaff]">
                            {result.category}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-white">{result.title}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-white/55">{result.detail}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="px-3 py-2.5 text-white/55">No matching hospital records.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">

            {/* Direct Switch to Visitor Facing screens */}
            <button
              onClick={onNavigateToKiosk}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--pc-border)] bg-[var(--pc-surface)] text-[var(--pc-text-muted)] hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)] text-[13px] font-medium transition-colors cursor-pointer"
              title="Open Visitor Self-Service Kiosk"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#2E37A4]" />
              <span>Visitor Kiosk</span>
            </button>

            <button
              onClick={onNavigateToVisitorTracker}
              className="liquid-glass hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-[var(--pc-text)] cursor-pointer"
              title="Open Mobile Patient Token Live Tracker"
            >
              <Activity className="w-3.5 h-3.5 text-[#00D3C7]" />
              <span>Patient Tracker</span>
            </button>

            {/* Notifications Button & Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowAlertsDropdown(!showAlertsDropdown)}
                className="relative p-2 rounded-md text-[var(--pc-text-muted)] hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)] border border-transparent transition-colors cursor-pointer"
              >
                <Bell className="w-4.5 h-4.5" />
                {alerts.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1.5 right-1.5 ring-2 ring-white animate-ping" />
                )}
                {alerts.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1.5 right-1.5" />
                )}
              </button>

              <AnimatePresence initial={false}>
                {showAlertsDropdown && (
                  <motion.div
                    className="absolute right-0 z-50 mt-2 w-80 space-y-2 rounded-md border border-[var(--pc-border)] bg-[var(--pc-surface)] p-3.5 text-[13px] shadow-lg"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: panelEase }}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--pc-border)]">
                      <span className="font-bold text-white font-display">System Alerts ({alerts.length})</span>
                      <button
                        onClick={() => setShowAlertsDropdown(false)}
                        className="text-white/40 hover:text-white text-xs cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {alerts.map((al) => (
                        <div key={al.id} className="p-2.5 rounded-md bg-[var(--pc-page)] border border-[var(--pc-border)] space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className={`font-bold text-[11px] ${al.severity === 'critical' || al.severity === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'
                              }`}>
                              {al.title}
                            </span>
                            <span className="text-[9px] text-white/40 font-mono">{al.time || al.timestamp}</span>
                          </div>
                          <p className="text-[10px] text-white/70">{al.message}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

        </header>

        {/* Tab Body */}
        <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 max-w-7xl w-full mx-auto">
          <AnimatePresence initial={false} mode="wait">
            <motion.section
              key={currentTab}
              className="min-h-full will-change-transform"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: panelEase }}
            >
              {currentTab === 'overview' && (
                <AdminOverview
                  counters={counters}
                  zones={zones}
                  predictions={predictions}
                  tokens={tokens}
                  onNavigateTab={onSelectTab}
                  onOpenCopilot={handleOpenCopilotWithPrompt}
                  onApplyRecommendation={handleApplyRecommendation}
                  recommendationApplied={recommendationApplied}
                />
              )}

              {currentTab === 'live-queue' && (
                <LiveQueueView
                  tokens={tokens}
                  counters={counters}
                  onUpdateToken={onUpdateToken}
                  onAddToken={onAddToken}
                />
              )}

              {currentTab === 'crowd-intel' && (
                <CrowdIntelligenceView
                  zones={zones}
                  sensors={sensors}
                />
              )}

              {currentTab === 'ai-predictions' && (
                <AIPredictionsView
                  predictions={predictions}
                  onOpenCopilot={handleOpenCopilotWithPrompt}
                  onNavigateCounterOpt={() => onSelectTab('counter-opt')}
                />
              )}

              {currentTab === 'counter-opt' && (
                <CounterOptimizationView
                  counters={counters}
                  onApplyOptimization={onApplyCounterOptimization}
                  onOpenCopilot={handleOpenCopilotWithPrompt}
                />
              )}

              {currentTab === 'appointments' && (
                <AppointmentsView onOpenCopilot={handleOpenCopilotWithPrompt} />
              )}

              {currentTab === 'doctor-schedule' && (
                <DoctorScheduleView
                  appointments={appointments.map((a) => ({
                    id: a.id,
                    tokenCode: a.code,
                    patientName: a.patientName,
                    time: a.time,
                    date: a.date,
                    doctor: a.doctor,
                    status: a.status,
                    service: a.service,
                    // The schedule board shows booked times, not queue waits.
                    estWaitMin: 0,
                  }))}
                  onAppointmentUpdated={onUpdateAppointment}
                  onAdminAction={handleAdminAction}
                />
              )}

              {currentTab === 'fairness' && (
                <FairnessLogicView
                  weights={fairnessWeights}
                  decisionLogs={decisionLogs}
                  onUpdateWeight={onUpdateFairnessWeight}
                  onOpenCopilot={handleOpenCopilotWithPrompt}
                />
              )}

              {currentTab === 'analytics' && (
                <AnalyticsView />
              )}

              {currentTab === 'camera-monitor' && (
                <CameraMonitorView />
              )}

              {/* Patient */}
              {currentTab === 'my-visit' && (
                <MyVisitView
                  onGetToken={onNavigateToKiosk}
                  onBookAppointment={onNavigateToVisitorTracker}
                />
              )}

              {/* Doctor — both views are scoped to the signed-in doctor by the API */}
              {currentTab === 'ai-health' && (
                <HealthNavigatorView
                  onBookAppointment={() => onNavigateToKiosk()}
                />
              )}

              {currentTab === 'requests' && <RequestsView />}
              {currentTab === 'my-patients' && <MyPatientsView />}

              {/* Management */}
              {currentTab === 'doctors' && <DoctorDirectoryView canManage={canManageDoctors} />}
              {currentTab === 'users' && <UsersRolesView />}
              {currentTab === 'audit' && <AuditLogView />}
            </motion.section>
          </AnimatePresence>
        </main>

      </div>

      {/* Floating QueueMind Copilot Button on Bottom-Right */}
      {/* A floating action button, not a banner. It was a full-width pill with
          16px padding and the whole product name showing at all times, which is
          a lot of screen for something that sits on top of the work. It rests as
          a 48px glass disc — the size a thumb expects — and widens to name
          itself when pointed at, so it is still discoverable. The label is on
          the button either way, so a screen reader always has it. */}
      <button
        onClick={() => handleOpenCopilotWithPrompt()}
        aria-label="Open QueueMind Copilot"
        title="QueueMind Copilot"
        className="liquid-glass pc-fab group fixed bottom-6 right-6 z-40 flex h-12 items-center gap-2 rounded-full px-3.5 font-semibold cursor-pointer"
      >
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <Sparkles className="h-5 w-5 text-[var(--pc-primary)]" />
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[var(--pc-success)] ring-2 ring-white" />
        </span>
        <span
          className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold text-[var(--pc-primary)] opacity-0 transition-[max-width,opacity] duration-300 ease-out group-hover:max-w-[140px] group-hover:opacity-100 group-focus-visible:max-w-[140px] group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          Copilot
        </span>
      </button>

      {/* Copilot Chat Drawer */}
      <CopilotDrawer
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        initialPrompt={copilotInitialPrompt}
        counters={counters}
        zones={zones}
        tokens={tokens}
        onApplyCounterOptimization={handleApplyRecommendation}
      />

    </div>
  );
};
