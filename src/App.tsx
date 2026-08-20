import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { VisitorKiosk } from './components/VisitorKiosk';
import { VisitorTokenView } from './components/VisitorTokenView';
import { AdminDashboard } from './components/AdminDashboard';
import { 
  AppView, 
  AdminTab, 
  Token, 
  Counter, 
  FacilityZone, 
  SensorNode, 
  PredictionPoint, 
  Appointment, 
  FairnessWeight, 
  DecisionLogEntry, 
  AlertItem 
} from './types';
import { 
  mockCounters, 
  mockZones, 
  mockSensors, 
  mockPredictions, 
  mockTokens, 
  mockAppointments, 
  mockFairnessWeights, 
  mockDecisionLogs, 
  mockAlerts 
} from './data/mockData';

const screenEase = [0.22, 1, 0.36, 1] as const;

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [currentAdminTab, setCurrentAdminTab] = useState<AdminTab>('overview');
  const shouldReduceMotion = useReducedMotion();

  // Application Data States
  const [counters, setCounters] = useState<Counter[]>(mockCounters);
  const [zones, setZones] = useState<FacilityZone[]>(mockZones);
  const [sensors, setSensors] = useState<SensorNode[]>(mockSensors);
  const [predictions, setPredictions] = useState<PredictionPoint[]>(mockPredictions);
  const [tokens, setTokens] = useState<Token[]>(mockTokens);
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [fairnessWeights, setFairnessWeights] = useState<FairnessWeight[]>(mockFairnessWeights);
  const [decisionLogs, setDecisionLogs] = useState<DecisionLogEntry[]>(mockDecisionLogs);
  const [alerts, setAlerts] = useState<AlertItem[]>(mockAlerts);

  // Active visitor token (default to A-184 for instant tracking)
  const [activeVisitorToken, setActiveVisitorToken] = useState<Token>(mockTokens[0]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentView]);

  const navigateToView = (view: AppView) => {
    if (view !== currentView) {
      setCurrentView(view);
    }
  };

  // Handler when user generates a token in the kiosk
  const handleTokenCreatedInKiosk = (newToken: Token) => {
    setTokens(prev => [newToken, ...prev]);
    setActiveVisitorToken(newToken);
    navigateToView('patient-tracker');
  };

  // Handler for updating token status
  const handleUpdateToken = (updatedToken: Token) => {
    setTokens(prev => prev.map(t => t.id === updatedToken.id ? updatedToken : t));
    if (activeVisitorToken.id === updatedToken.id) {
      setActiveVisitorToken(updatedToken);
    }
  };

  // Handler for adding token
  const handleAddToken = (newToken: Token) => {
    setTokens(prev => [newToken, ...prev]);
  };

  // Handler for updating appointment
  const handleUpdateAppointment = (updatedApt: Appointment) => {
    setAppointments(prev => prev.map(a => a.id === updatedApt.id ? updatedApt : a));
  };

  // Handler for adding appointment
  const handleAddAppointment = (newApt: Appointment) => {
    setAppointments(prev => [newApt, ...prev]);
  };

  // Handler for adjusting fairness weight
  const handleUpdateFairnessWeight = (id: string, multiplier: number) => {
    setFairnessWeights(prev => prev.map(w => w.id === id ? { ...w, multiplier } : w));
  };

  // Handler for applying counter load rebalancing
  const handleApplyCounterOptimization = (updatedCounters: Counter[]) => {
    setCounters(updatedCounters);
  };

  return (
    <div className="min-h-screen frosted-canvas text-white flex flex-col font-sans antialiased selection:bg-[#8e7dff] selection:text-white">
      
      {/* Global Navigation Header */}
      <Navbar
        currentView={currentView}
        onSelectView={navigateToView}
        activeTokenCode={activeVisitorToken?.code}
      />

      {/* Main View Switcher */}
      <div className="relative flex-1 overflow-x-clip">
        <AnimatePresence initial={false} mode="wait">
          <motion.main
            key={currentView}
            className="min-h-full will-change-transform"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: screenEase }}
          >
            {currentView === 'landing' && (
              <LandingPage
                onLaunchKiosk={() => navigateToView('kiosk')}
                onLaunchAdmin={() => {
                  setCurrentAdminTab('overview');
                  navigateToView('admin');
                }}
                onLaunchTracker={() => navigateToView('patient-tracker')}
              />
            )}

            {currentView === 'kiosk' && (
              <VisitorKiosk
                onTokenGenerated={handleTokenCreatedInKiosk}
                onBackToHome={() => navigateToView('landing')}
              />
            )}

            {currentView === 'patient-tracker' && (
              <VisitorTokenView
                token={activeVisitorToken}
                onUpdateToken={handleUpdateToken}
                onBackToKiosk={() => navigateToView('kiosk')}
              />
            )}

            {currentView === 'admin' && (
              <AdminDashboard
                currentTab={currentAdminTab}
                onSelectTab={setCurrentAdminTab}
                counters={counters}
                zones={zones}
                sensors={sensors}
                predictions={predictions}
                tokens={tokens}
                appointments={appointments}
                fairnessWeights={fairnessWeights}
                decisionLogs={decisionLogs}
                alerts={alerts}
                onUpdateToken={handleUpdateToken}
                onAddToken={handleAddToken}
                onUpdateAppointment={handleUpdateAppointment}
                onAddAppointment={handleAddAppointment}
                onUpdateFairnessWeight={handleUpdateFairnessWeight}
                onApplyCounterOptimization={handleApplyCounterOptimization}
                onNavigateToKiosk={() => navigateToView('kiosk')}
                onNavigateToVisitorTracker={() => navigateToView('patient-tracker')}
              />
            )}
          </motion.main>
        </AnimatePresence>
      </div>

    </div>
  );
}
