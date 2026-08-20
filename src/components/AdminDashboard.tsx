import React, { useMemo, useState } from 'react';
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
import { AppointmentsView } from './AppointmentsView';
import { FairnessLogicView } from './FairnessLogicView';
import { AnalyticsView } from './AnalyticsView';
import { CopilotDrawer } from './CopilotDrawer';
import { 
  AdminTab, 
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
  appointments: Appointment[];
  fairnessWeights: FairnessWeight[];
  decisionLogs: DecisionLogEntry[];
  alerts: AlertItem[];
  onUpdateToken: (token: Token) => void;
  onAddToken: (token: Token) => void;
  onUpdateAppointment: (appointment: Appointment) => void;
  onAddAppointment: (appointment: Appointment) => void;
  onUpdateFairnessWeight: (id: string, multiplier: number) => void;
  onApplyCounterOptimization: (updatedCounters: Counter[]) => void;
  onNavigateToKiosk: () => void;
  onNavigateToVisitorTracker: () => void;
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
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<string | undefined>(undefined);
  const [recommendationApplied, setRecommendationApplied] = useState(false);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const shouldReduceMotion = useReducedMotion();

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
        .filter((appointment) => matches(appointment.patientName, appointment.tokenCode, appointment.doctor, appointment.service, appointment.status))
        .map((appointment) => ({
          id: `appointment-${appointment.id}`,
          category: 'Appointment' as const,
          title: `${appointment.patientName} · ${appointment.tokenCode}`,
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

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden text-white">
      
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={onSelectTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 min-w-0 flex-col overflow-x-hidden">
        
        {/* Top Operational Bar (Frosted Glass Header) */}
        <header className="shrink-0 bg-white/[0.04] border-b border-white/[0.10] backdrop-blur-2xl px-6 py-3.5 flex items-center justify-between z-20 shadow-md">
          
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
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
                className="w-full pl-10 pr-4 py-2 glass-input rounded-2xl text-xs placeholder-white/40 text-white"
              />

              {showSearchResults && searchQuery.trim() && (
                <div
                  id="hospital-search-results"
                  role="listbox"
                  className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/[0.18] bg-[#12122b] p-2 text-xs shadow-2xl"
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
                          className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08] cursor-pointer"
                        >
                          <span className="mt-0.5 shrink-0 rounded-full border border-[#8e7dff]/40 bg-[#8e7dff]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#b4aaff]">
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
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white/80 hover:text-white text-xs font-semibold transition-all cursor-pointer"
              title="Open Visitor Self-Service Kiosk"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#8e7dff]" />
              <span>Visitor Kiosk</span>
            </button>

            <button
              onClick={onNavigateToVisitorTracker}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#8e7dff]/20 hover:bg-[#8e7dff]/30 text-white text-xs font-semibold border border-[#8e7dff]/40 shadow-sm transition-all cursor-pointer"
              title="Open Mobile Patient Token Live Tracker"
            >
              <Activity className="w-3.5 h-3.5 text-[#ff7db8]" />
              <span>Patient Tracker (A-184)</span>
            </button>

            {/* Notifications Button & Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowAlertsDropdown(!showAlertsDropdown)}
                className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/[0.10] border border-transparent hover:border-white/[0.12] relative transition-colors cursor-pointer"
              >
                <Bell className="w-4.5 h-4.5" />
                {alerts.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1.5 right-1.5 ring-2 ring-[#0c0c1e] animate-ping" />
                )}
                {alerts.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1.5 right-1.5" />
                )}
              </button>

              <AnimatePresence initial={false}>
                {showAlertsDropdown && (
                  <motion.div
                    className="absolute right-0 z-50 mt-2 w-80 space-y-2 rounded-2xl border border-white/[0.18] bg-[#12122b] p-3.5 text-xs shadow-2xl backdrop-blur-2xl"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: panelEase }}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.10]">
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
                        <div key={al.id} className="p-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className={`font-bold text-[11px] ${
                              al.severity === 'critical' || al.severity === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'
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
        <main className="flex-1 min-h-0 overflow-y-auto p-6 max-w-7xl w-full mx-auto">
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
            <AppointmentsView
              appointments={appointments}
              onUpdateAppointment={onUpdateAppointment}
              onAddAppointment={onAddAppointment}
              onOpenCopilot={handleOpenCopilotWithPrompt}
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
            </motion.section>
          </AnimatePresence>
        </main>

      </div>

      {/* Floating QueueMind Copilot Button on Bottom-Right */}
      <button
        onClick={() => handleOpenCopilotWithPrompt()}
        className="fixed bottom-6 right-6 z-40 p-4 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-purple-600 hover:from-[#7b69fd] hover:to-purple-500 text-white font-bold shadow-xl shadow-[#8e7dff]/30 flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer group border border-white/20 backdrop-blur-xl"
      >
        <div className="relative">
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-emerald-400 absolute -top-1 -right-1 ring-2 ring-purple-900" />
        </div>
        <span className="text-xs font-bold font-display pr-1">QueueMind Copilot</span>
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
