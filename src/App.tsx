import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/ProfileModal';
import { authApi } from './services/authApi';
import { wakeServer } from './services/apiClient';
import { LiquidGlassDefs } from './components/LiquidGlassDefs';
import { User } from './types';
import { VisitorKiosk } from './components/VisitorKiosk';
import { VisitorTokenView } from './components/VisitorTokenView';
import { PatientTrackerCarousel } from './components/PatientTrackerCarousel';
import { AdminDashboard } from './components/AdminDashboard';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { DoctorDashboard } from './components/DoctorDashboard';
import { VisitorStart, WalkInTokenFlow } from './components/VisitorFlow';
import { serviceDayKey } from '../lib/serviceDay';

import type { PublicQueueToken } from './components/VisitorFlow';
import { AppointmentFlow } from './components/AppointmentFlow';
import type { PublicAppointment, DoctorOption } from './components/AppointmentFlow';
import { visitorApi, adminApi } from './services/queueApi';
import { doctorApi } from './services/doctorApi';
import { useLiveUpdates } from './hooks/useLiveUpdates';
import { defaultTabForRole } from '../lib/permissions';
import { cameraService } from './services/cameraService';
import type { StaffAppointment } from './components/AppointmentsView';
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
  mockFairnessWeights,
  mockDecisionLogs,
  mockAlerts
} from './data/mockData';

const screenEase = [0.22, 1, 0.36, 1] as const;

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [currentAdminTab, setCurrentAdminTab] = useState<AdminTab>('overview');
  const shouldReduceMotion = useReducedMotion();

  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Live visitor flow state (API-backed)
  const [liveToken, setLiveToken] = useState<PublicQueueToken | null>(null);
  const [liveAppointment, setLiveAppointment] = useState<PublicAppointment | null>(null);
  const [doctorList, setDoctorList] = useState<DoctorOption[]>([]);

  useEffect(() => {
    // Nudge the server awake immediately. Free hosting stops the instance when
    // it has been idle, and the request that restarts it can take the better
    // part of a minute — better to spend that wait here, while the page is
    // still being read, than in front of the sign-in button.
    wakeServer();

    // Check for Google OAuth callback params in URL hash
    const hash = window.location.hash.substring(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const hashToken = params.get('auth_token');
      const hashUserStr = params.get('auth_user');
      const hashError = params.get('auth_error');

      if (hashToken && hashUserStr) {
        try {
          const hashUser = JSON.parse(decodeURIComponent(hashUserStr));
          window.localStorage.setItem('auth_token', hashToken);
          setUser(hashUser);
          
          if (hashUser.role === 'VISITOR') {
            visitorApi.getMyActiveToken().then(token => {
              if (token) setLiveToken(token);
            }).catch(() => {});
          }
          
          // Clear hash
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          setIsAuthLoading(false);
          return;
        } catch (e) {
          console.error("Failed to parse user from hash");
        }
      } else if (hashError) {
        // Clear hash but maybe we want to show it in UI? For now just clear it.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        // Could pass to a global error state here if needed
      }
    }

    authApi.verify()
      .then(res => {
        setUser(res.user);
        // Try restoring token for authenticated user
        if (res.user.role === 'VISITOR') {
          visitorApi.getMyActiveToken().then(token => {
            if (token) setLiveToken(token);
          }).catch(() => {});
        }
      })
      .catch(() => {
        setUser(null);
        // Fallback for unauthenticated user: check localStorage
        const storedTokenId = window.localStorage.getItem('queuemind:active-visitor-token');
        if (storedTokenId) {
          visitorApi.getToken(storedTokenId)
            .then(token => {
              if (token.status === 'Waiting' || token.status === 'Approaching' || token.status === 'Serving') {
                setLiveToken(token);
              } else {
                window.localStorage.removeItem('queuemind:active-visitor-token');
              }
            })
            .catch(() => window.localStorage.removeItem('queuemind:active-visitor-token'));
        }
      })
      .finally(() => setIsAuthLoading(false));
  }, []);

  const handleLogout = () => {
    authApi.logout();
    cameraService.stop();
    setUser(null);
    setLiveToken(null);
    setIsProfileModalOpen(false);
    if (currentView === 'super-admin' || currentView === 'admin' || currentView === 'doctor') {
      setCurrentView('visitor');
    }
  };

  useEffect(() => {
    if (!user) {
      if (currentView === 'super-admin' || currentView === 'admin' || currentView === 'doctor') {
        setCurrentView('visitor');
      }
    } else if (currentView === 'super-admin' && user.role !== 'SUPER_ADMIN') {
      setCurrentView('visitor');
    } else if (currentView === 'doctor' && user.role !== 'DOCTOR') {
      setCurrentView('visitor');
    }
  }, [user, currentView]);


  // Application Data States
  const [counters, setCounters] = useState<Counter[]>(mockCounters);
  const [zones, setZones] = useState<FacilityZone[]>(mockZones);
  const [sensors, setSensors] = useState<SensorNode[]>(mockSensors);
  const [predictions, setPredictions] = useState<PredictionPoint[]>(mockPredictions);
  // The live queue is real data, and starts empty.
  //
  // Seeding it with mockTokens to avoid a blank first paint meant the tracker
  // briefly rendered five invented patients with invented ids. Tapping one and
  // pressing "Complete consultation" sent an id like "t-184" to the API, which
  // correctly answered "the token was not found" — the patient had acted on a
  // row that never existed. An empty list and a loading state is honest; fake
  // rows that accept taps are not.
  const [tokens, setTokens] = useState<Token[]>([]);
  // Lets the live stream trigger the same refetch the poller uses.
  const queueRefetchRef = useRef<(() => void) | null>(null);

  // Real appointments, loaded for staff. This was seeded with mockAppointments,
  // so the Appointments tab showed demo rows while genuine bookings — which sit
  // Pending until somebody approves them, and so never reach the live queue —
  // were invisible to every staff role.
  // Typed as the API's real projection, not the mock `Appointment` shape. The
  // cast that used to sit here hid a field-name drift that crashed the
  // Appointments tab, so consumers are now checked against the response.
  const [appointments, setAppointments] = useState<StaffAppointment[]>([]);
  const [fairnessWeights, setFairnessWeights] = useState<FairnessWeight[]>(mockFairnessWeights);
  const [decisionLogs, setDecisionLogs] = useState<DecisionLogEntry[]>(mockDecisionLogs);
  const [alerts, setAlerts] = useState<AlertItem[]>(mockAlerts);

  // Selected token for detail view in patient-tracker carousel
  const [selectedTrackerToken, setSelectedTrackerToken] = useState<Token | PublicQueueToken | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentView]);

  // Keep the Command Center on the real queue. Doctors read their own scoped
  // queue; staff and above read the facility board. Patients never poll it.
  useEffect(() => {
    const role = user?.role;
    if (!role || role === 'VISITOR') return;

    let mounted = true;
    const fetchQueue = async () => {
      try {
        const live = role === 'DOCTOR'
          ? await doctorApi.getQueue()
          : await adminApi.getTokens();
        if (!mounted) return;
        setTokens(live as Token[]);
      } catch {
        // Leave the last good list in place rather than emptying the board.
      }
    };

    fetchQueue();
    // Polling is the safety net; the live stream below is what makes changes
    // appear at once.
    const interval = setInterval(fetchQueue, 10000);
    queueRefetchRef.current = fetchQueue;
    return () => {
      mounted = false;
      queueRefetchRef.current = null;
      clearInterval(interval);
    };
  }, [user?.role]);

  // Any queue or appointment change anywhere refreshes the board immediately.
  // Declared before the subscriber that calls it.
  const loadAppointments = useRef<() => void>(() => {});

  useLiveUpdates(() => {
    queueRefetchRef.current?.();
    // An appointment approved or denied anywhere changes this list too, and it
    // is the list that shows what is still waiting on somebody.
    loadAppointments.current?.();
  }, { enabled: !!user && user.role !== 'VISITOR' });

  // A signed-in visitor's own token drives the nav pill, so it has to track the
  // real one — including the moment it is issued, edited or cancelled.
  const refreshMyToken = async () => {
    try {
      const mine = await visitorApi.getMyActiveToken();
      setLiveToken(mine);
    } catch {
      // Keep whatever we already had rather than blanking the pill.
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'VISITOR') return;
    refreshMyToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useLiveUpdates(() => refreshMyToken(), { enabled: !!user && user.role === 'VISITOR' });

  const isAdminOrAbove = (u: User | null) => u?.role === 'ADMIN' || u?.role === 'SUPER_ADMIN';

  const navigateToView = (view: AppView) => {
    let targetView = view;

    // The Command Center is role-aware, so opening it always starts on the tab
    // that role owns (patients land on My Visit, staff on the live queue).
    if (view === 'admin' && user) {
      setCurrentAdminTab(defaultTabForRole(user.role));
    }

    // Role-based routing for Live Queue
    if (view === 'patient-tracker') {
      // A doctor gets the tracker scoped to their own queue by the API.
      if (!isAdminOrAbove(user) && user?.role !== 'DOCTOR') {
        if (liveToken) {
          targetView = 'visitor-queue';
        } else {
          targetView = 'visitor'; // Or Kiosk if we prefer, but visitor walk-in is safer
        }
      }
    }

    if (targetView !== currentView) {
      if (currentView === 'patient-tracker') {
        setSelectedTrackerToken(null);
      }
      setCurrentView(targetView);
    }
  };

  // Handler when user generates a token in the kiosk
  /** A token was issued at the kiosk. Record it, but stay on the ticket screen. */
  const handleTokenIssuedAtKiosk = (newToken: Token) => {
    setTokens(prev => [newToken, ...prev]);
    // Keeps the nav pill current without waiting for the next poll.
    refreshMyToken();
  };

  /**
   * "Track on mobile" from the kiosk ticket. Loads the token's public view and
   * opens the live tracker on it. Going via `patient-tracker` sent anonymous
   * visitors to the start screen and admins to the facility board — neither
   * showed the token that was just issued.
   */
  const handleTrackKioskToken = async (newToken: Token) => {
    handleTokenIssuedAtKiosk(newToken);
    try {
      const publicToken = await visitorApi.getToken(newToken.id);
      setLiveToken(publicToken);
      window.localStorage.setItem('queuemind:active-visitor-token', publicToken.id);
      setCurrentView('visitor-queue');
    } catch {
      // Without the access key we cannot open the private view; the kiosk
      // ticket stays on screen rather than dumping the visitor somewhere blank.
    }
  };

  useEffect(() => {
    if (!user || !['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'].includes(user.role)) {
      setAppointments([]);
      return;
    }
    let cancelled = false;
    const run = () => {
      adminApi.getAppointments()
        .then((data) => { if (!cancelled) setAppointments(data.appointments as StaffAppointment[]); })
        .catch(() => { /* the tab shows its own empty state */ });
    };
    loadAppointments.current = run;
    run();
    return () => { cancelled = true; };
  }, [user]);

  // Handler for updating token status
  // The holder's own token and the staff board row are different shapes for the
  // same queue entry, so the change is merged onto the existing row rather than
  // replacing it — replacing would drop the board-only fields.
  const handleUpdateToken = (updatedToken: Token | PublicQueueToken) => {
    setTokens(prev => prev.map(t => (t.id === updatedToken.id ? { ...t, ...updatedToken } as Token : t)));
  };

  // Handler for adding token
  const handleAddToken = (newToken: Token) => {
    setTokens(prev => [newToken, ...prev]);
  };

  /**
   * An appointment changed somewhere in the shell.
   *
   * These used to splice a hand-built row into local state, which is how a
   * rescheduled appointment ended up carrying an invented status and wait time
   * that no longer matched the database. The server owns this list, so the only
   * correct response to a change is to read it back.
   */
  const handleUpdateAppointment = (_updatedApt?: unknown) => {
    loadAppointments.current?.();
  };

  const handleAddAppointment = (_newApt?: unknown) => {
    loadAppointments.current?.();
  };

  // Handler for adjusting fairness weight
  const handleUpdateFairnessWeight = (id: string, multiplier: number) => {
    setFairnessWeights(prev => prev.map(w => w.id === id ? { ...w, multiplier } : w));
  };

  // Handler for applying counter load rebalancing
  const handleApplyCounterOptimization = (updatedCounters: Counter[]) => {
    setCounters(updatedCounters);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a16] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#2E37A4] via-[#3538CD] to-[#00D3C7] flex items-center justify-center text-white shadow-lg shadow-[#2E37A4]/25 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          </div>
          <p className="text-white/60 font-medium text-sm tracking-wide">Initializing QueueMind AI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pc min-h-screen bg-[var(--pc-page)] text-[var(--pc-text)] flex flex-col font-sans antialiased selection:bg-[#2E37A4] selection:text-white">

      {/* Refraction filters for the glass material. Mounted once, renders
          nothing, referenced from CSS by id. */}
      <LiquidGlassDefs />

      {/* Global Navigation Header */}
      <Navbar
        currentView={currentView}
        onSelectView={navigateToView}
        user={user}
        onLoginClick={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        onProfileClick={() => setIsProfileModalOpen(true)}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        user={user}
        onClose={() => setIsProfileModalOpen(false)}
        onSaved={(updated) => setUser(updated)}
      />

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onLoginSuccess={(u) => {
          setUser(u);
          if (u.role === 'SUPER_ADMIN') setCurrentView('super-admin');
          else if (u.role === 'ADMIN') setCurrentView('admin');
          else if (u.role === 'DOCTOR') setCurrentView('doctor');
        }} 
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
                onLaunchVisitor={() => navigateToView('visitor')}
              />
            )}

            {currentView === 'kiosk' && (
              <VisitorKiosk
                user={user}
                onIssueToken={handleTokenIssuedAtKiosk}
                onTokenGenerated={handleTrackKioskToken}
                onBackToHome={() => navigateToView('landing')}
              />
            )}

            {currentView === 'patient-tracker' && (
              selectedTrackerToken ? (
                <VisitorTokenView
                  viewerRole={user?.role ?? null}
                  token={selectedTrackerToken}
                  onUpdateToken={(updated) => {
                    handleUpdateToken(updated);
                    setSelectedTrackerToken(updated);
                  }}
                  onBackToKiosk={() => setSelectedTrackerToken(null)}
                  onGetNewToken={() => navigateToView('kiosk')}
                />
              ) : (
                <PatientTrackerCarousel
                  tokens={tokens}
                  onUpdateToken={handleUpdateToken}
                  onSelectToken={(token) => setSelectedTrackerToken(token)}
                  onBack={() => navigateToView('landing')}
                  user={user}
                />
              )
            )}

            {currentView === 'visitor-queue' && liveToken && (
              <VisitorTokenView
                viewerRole={user?.role ?? null}
                token={liveToken}
                onBackToKiosk={() => navigateToView('landing')}
                onGetNewToken={() => navigateToView('kiosk')}
              />
            )}

            {/* Visitor QR Flow — Walk-in Token */}
            {currentView === 'visitor' && (
              <VisitorStart
                facilityName="CityCare Hospital"
                onStartWalkIn={() => navigateToView('visitor-token')}
                onStartAppointment={() => {
                  visitorApi.getDoctors(serviceDayKey())
                    .then(setDoctorList)
                    .catch(() => {});
                  navigateToView('visitor-appointment');
                }}
              />
            )}

            {currentView === 'visitor-token' && (
              <WalkInTokenFlow
                user={user}
                facilityName="CityCare Hospital"
                initialToken={liveToken}
                onCreateToken={async (request) => {
                  const token = await visitorApi.createToken(request);
                  setLiveToken(token);
                  window.localStorage.setItem('queuemind:active-visitor-token', token.id);
                  return token;
                }}
                onRefreshToken={async (tokenId) => {
                  const token = await visitorApi.getToken(tokenId);
                  setLiveToken(token);
                  return token;
                }}
                onBack={() => navigateToView('visitor')}
                onBookAppointment={() => {
                  visitorApi.getDoctors(serviceDayKey())
                    .then(setDoctorList)
                    .catch(() => {});
                  navigateToView('visitor-appointment');
                }}
              />
            )}

            {currentView === 'visitor-appointment' && (
              <AppointmentFlow
                user={user}
                doctors={doctorList}
                initialAppointment={liveAppointment}
                onGetSlots={(doctorId, date) =>
                  visitorApi.getAvailableTimes(doctorId, date)
                }
                onCreateAppointment={async (request) => {
                  const appointment = await visitorApi.createAppointment(request);
                  setLiveAppointment(appointment);
                  return appointment;
                }}
                onRefreshAppointment={async (appointmentId) => {
                  const appointment = await visitorApi.getAppointment(appointmentId);
                  setLiveAppointment(appointment);
                  return appointment;
                }}
                onRequestAnotherTime={async (appointment) => {
                  const updated = await visitorApi.requestAnotherAppointmentTime(appointment);
                  setLiveAppointment(updated);
                  return updated;
                }}
                onBack={() => navigateToView('visitor')}
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
                onNavigateToVisitorTracker={() => navigateToView('visitor-appointment')}
                user={user}
              />
            )}

            {currentView === 'super-admin' && (
              <SuperAdminDashboard />
            )}

            {currentView === 'doctor' && (
              <DoctorDashboard user={user as User} onLogout={handleLogout} />
            )}
          </motion.main>
        </AnimatePresence>
      </div>

    </div>
  );
}
