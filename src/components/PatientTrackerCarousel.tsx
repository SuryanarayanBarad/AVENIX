import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { adminApi, visitorApi } from '../services/queueApi';
import { doctorApi } from '../services/doctorApi';
import { DoctorAppointmentModal } from './DoctorAppointmentModal';
import {
  Search,
  Clock,
  Users,
  ArrowLeft,
  Stethoscope,
  AlertCircle,
  CreditCard,
  Pill,
  CalendarCheck,
  FileText,
  Heart,
  Activity,
  Timer,
  RefreshCw,
  BadgeCheck,
  GraduationCap,
  UserRound,
} from 'lucide-react';
import { Token, PublicDoctor, User } from '../types';

/* ─── helpers ─── */

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  serving:     { label: 'NOW SERVING', color: 'text-emerald-300', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' },
  approaching: { label: 'APPROACHING', color: 'text-amber-300',   bg: 'bg-amber-500/20',   border: 'border-amber-500/30' },
  waiting:     { label: 'WAITING',     color: 'text-blue-300',    bg: 'bg-blue-500/20',    border: 'border-blue-500/30' },
  completed:   { label: 'COMPLETED',   color: 'text-white/50',    bg: 'bg-white/10',       border: 'border-white/10' },
};

const priorityConfig: Record<string, { color: string; bg: string; border: string }> = {
  Emergency: { color: 'text-rose-300',    bg: 'bg-rose-500/20',    border: 'border-rose-500/30' },
  Priority:  { color: 'text-amber-300',   bg: 'bg-amber-500/20',   border: 'border-amber-500/30' },
  Normal:    { color: 'text-white/60',    bg: 'bg-white/[0.06]',   border: 'border-white/10' },
};

const serviceIcon: Record<string, React.FC<{ className?: string }>> = {
  'General Consultation':    Stethoscope,
  'Pediatrics':              Heart,
  'Emergency Triage':        AlertCircle,
  'Billing & Discharge':     CreditCard,
  'Pharmacy & Dispensing':   Pill,
  'Specialist Appointments': CalendarCheck,
  'Registration':            FileText,
};

/* ─── card component ─── */

const PatientCard: React.FC<{
  token: Token;
  onClick?: () => void;
  onRefreshWait?: (token: Token) => void;
}> = ({ token, onClick, onRefreshWait }) => {
  const status = statusConfig[token.status] || statusConfig.waiting;
  const priority = priorityConfig[token.priority] || priorityConfig.Normal;
  const Icon = serviceIcon[token.service] || Activity;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const progressPct = token.status === 'serving'
    ? 100
    : token.status === 'approaching'
      ? 85
      : Math.max(10, Math.min(75, 100 - (token.peopleAhead / 15) * 100));

  const handleRefreshWait = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    // Simulate a live wait-time refresh
    setTimeout(() => {
      if (onRefreshWait) {
        const jitter = Math.floor(Math.random() * 5) - 2; // -2 to +2 min
        const newWait = Math.max(0, token.estWaitMin + jitter);
        const newAhead = Math.max(0, token.peopleAhead + (jitter > 0 ? 1 : jitter < 0 ? -1 : 0));
        onRefreshWait({
          ...token,
          estWaitMin: newWait,
          peopleAhead: newAhead,
          status: newWait === 0 ? 'serving' : token.status,
        });
      }
      setIsRefreshing(false);
    }, 800);
  };

  return (
    <div
      className="glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/[0.10] hover:border-[#2E37A4]/40 hover:shadow-[0_0_20px_rgba(46,55,164,0.10)] transition-all cursor-pointer"
      onClick={onClick}
    >

      {/* Card Header */}
      <div className="p-5 pb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#2E37A4] to-[#00D3C7] flex items-center justify-center text-white shadow-lg shadow-[#2E37A4]/20 border border-white/20">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-white text-lg font-mono tracking-tight">{token.code}</div>
            <div className="text-xs text-white/50 mt-0.5">{token.service}</div>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${status.bg} ${status.color} ${status.border} border`}>
          {status.label}
        </span>
      </div>

      {/* Patient Info */}
      <div className="px-5 pb-3">
        <div className="text-sm font-semibold text-white truncate">{token.patientName}</div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-white/50">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {token.issueTime}
          </span>
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${priority.bg} ${priority.color} ${priority.border} border text-[10px] font-semibold`}>
            {token.priority}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-5 pb-3">
        <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progressPct}%`,
              background: token.status === 'serving'
                ? 'linear-gradient(90deg, #4ade80, #22d3ee)'
                : token.status === 'approaching'
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #2E37A4, #a78bfa)',
            }}
          />
        </div>
      </div>

      {/* Stats Footer */}
      <div className="mt-auto px-5 py-4 border-t border-white/[0.06] flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {/* Wait Time Button */}
          <button
            onClick={handleRefreshWait}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2E37A4]/15 hover:bg-[#2E37A4]/25 border border-[#2E37A4]/30 text-white font-semibold transition-all cursor-pointer active:scale-95 ${isRefreshing ? 'animate-pulse' : ''}`}
            title="Refresh estimated wait time"
          >
            {isRefreshing ? (
              <RefreshCw className="w-3.5 h-3.5 text-[#2E37A4] animate-spin" />
            ) : (
              <Timer className="w-3.5 h-3.5 text-[#2E37A4]" />
            )}
            <span>~{token.estWaitMin} min</span>
          </button>
          <div className="flex items-center gap-1 text-white/50">
            <Users className="w-3.5 h-3.5" />
            <span>{token.peopleAhead} ahead</span>
          </div>
        </div>
        <div className="text-white/40 font-mono text-[11px]">{token.counterId}</div>
      </div>

    </div>
  );
};

/* ─── doctor directory card ─── */

const doctorStatusTone: Record<string, string> = {
  Available: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Busy: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Delayed: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  Unavailable: 'bg-white/10 text-white/50 border-white/10',
};

const DoctorCard: React.FC<{ doctor: PublicDoctor }> = ({ doctor }) => {
  const [photoFailed, setPhotoFailed] = useState(false);
  const tone = doctorStatusTone[doctor.status || ''] || doctorStatusTone.Unavailable;
  const initials = doctor.name
    .replace(/^Dr\.?\s*/i, '')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/[0.10] hover:border-[#2E37A4]/40 hover:shadow-[0_0_20px_rgba(46,55,164,0.10)] transition-all">

      {/* Card Header */}
      <div className="p-5 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {doctor.photoUrl && !photoFailed ? (
            <img
              src={doctor.photoUrl}
              alt={doctor.name}
              onError={() => setPhotoFailed(true)}
              className="w-14 h-14 rounded-2xl object-cover border border-white/20 shadow-lg shadow-[#2E37A4]/20 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#2E37A4] to-[#00D3C7] flex items-center justify-center text-white font-bold text-base shadow-lg shadow-[#2E37A4]/20 border border-white/20 shrink-0">
              {initials || <UserRound className="w-6 h-6" />}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-white text-base truncate">{doctor.name}</div>
            <div className="text-xs text-[#b9b0ff] mt-0.5 truncate">{doctor.specialization || doctor.department}</div>
          </div>
        </div>
        {doctor.status && (
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 ${tone}`}>
            {doctor.status.toUpperCase()}
          </span>
        )}
      </div>

      {/* Doctor Info */}
      <div className="px-5 pb-3 space-y-1.5 text-xs text-white/60">
        {doctor.qualification && (
          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5 text-[#2E37A4]" />
            <span className="truncate">{doctor.qualification}</span>
          </div>
        )}
        {!!doctor.experienceYears && (
          <div className="flex items-center gap-1.5">
            <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{doctor.experienceYears} years experience</span>
          </div>
        )}
        {doctor.bio && <p className="text-white/50 leading-relaxed line-clamp-2 pt-0.5">{doctor.bio}</p>}
      </div>

      {/* Footer */}
      <div className="mt-auto px-5 py-4 border-t border-white/[0.06] flex items-center justify-between text-xs">
        <span className="liquid-glass flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-[var(--pc-text)]">
          <Stethoscope className="w-3.5 h-3.5 text-[#2E37A4]" />
          {doctor.specialization || doctor.department}
        </span>
        {!!doctor.consultationFee && (
          <span className="text-white/40 font-mono text-[11px]">₹{doctor.consultationFee}</span>
        )}
      </div>
    </div>
  );
};

/* ─── patients / doctors switcher ─── */

type TrackerSegment = 'patients' | 'doctors';

const SegmentedSwitcher: React.FC<{
  value: TrackerSegment;
  onChange: (value: TrackerSegment) => void;
}> = ({ value, onChange }) => {
  const shouldReduceMotion = useReducedMotion();
  const options: { id: TrackerSegment; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'doctors', label: 'Doctors', icon: Stethoscope },
  ];

  return (
    <div
      role="tablist"
      aria-label="Show patients or doctors"
      className="inline-flex items-stretch bg-white/[0.06] p-1.5 rounded-2xl border border-white/[0.12] backdrop-blur-xl text-xs font-medium gap-1.5"
    >
      {options.map((option) => {
        const isActive = value === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.id)}
            className={`relative flex items-center justify-center gap-1.5 px-4 sm:px-5 py-1.5 rounded-xl transition-colors cursor-pointer ${
              isActive ? 'text-white font-bold' : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="tracker-segment-highlight"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#2E37A4]/30 to-[#3538CD]/30 border border-[#2E37A4]/50 shadow-[0_0_15px_rgba(46,55,164,0.16)]"
                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <Icon className="relative w-3.5 h-3.5" />
            <span className="relative leading-tight uppercase tracking-wide">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

/* ─── main grid view ─── */

interface PatientTrackerCarouselProps {
  tokens: Token[];
  onUpdateToken: (token: Token) => void;
  onSelectToken: (token: Token) => void;
  onBack: () => void;
  /** Drives which queue endpoint is used — a doctor only ever sees their own. */
  user?: User | null;
}

export const PatientTrackerCarousel: React.FC<PatientTrackerCarouselProps> = ({
  tokens: initialTokens,
  onUpdateToken,
  onSelectToken,
  onBack,
  user = null,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [liveTokens, setLiveTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [segment, setSegment] = useState<TrackerSegment>('patients');
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [isDoctorsLoading, setIsDoctorsLoading] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const isDoctorUser = user?.role === 'DOCTOR';

  // An appointment row and a walk-in row carry different kinds of id, so they
  // open different things. Sending both to the token view is what produced
  // "the token was not found".
  const [appointmentRow, setAppointmentRow] = useState<any>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const openRow = (token: any) => {
    if (token?.kind === 'appointment' || (isDoctorUser && token?.appointmentStatus)) {
      setAppointmentRow(token);
      return;
    }
    onSelectToken(token);
  };

  // Only ever the live queue.
  //
  // This used to fall back to initialTokens while the first fetch was in
  // flight, so during that window the board showed seeded demo rows. They
  // looked identical to real ones and were tappable, and the id behind them
  // did not exist in the database — which is what produced "the token was not
  // found" when a patient completed one. A pending fetch now shows nothing.
  const displayTokens = liveTokens;

  useEffect(() => {
    let mounted = true;
    const fetchTokens = async () => {
      try {
        // A signed-in doctor reads /api/doctor/queue, which the server scopes to
        // that doctor's own patients. Everyone else uses the admin queue.
        const result = isDoctorUser
          ? await doctorApi.getQueue(searchQuery)
          : await adminApi.getTokens(searchQuery);
        if (mounted) {
          setLiveTokens(result as Token[]);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch queue tokens:', err);
        if (mounted) setIsLoading(false);
      }
    };

    if (segment !== 'patients') return;

    setIsLoading(true);
    fetchTokens();

    // Poll every 10 seconds for live updates
    const interval = setInterval(fetchTokens, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [searchQuery, segment, isDoctorUser, refreshNonce]);

  // Doctor directory is fetched lazily the first time the Doctors tab is opened.
  useEffect(() => {
    if (segment !== 'doctors' || doctors.length > 0) return;
    let mounted = true;
    setIsDoctorsLoading(true);
    visitorApi.getDoctorDirectory()
      .then((result) => {
        if (mounted) setDoctors(result);
      })
      .catch((err) => console.error('Failed to fetch doctor directory:', err))
      .finally(() => {
        if (mounted) setIsDoctorsLoading(false);
      });
    return () => { mounted = false; };
  }, [segment, doctors.length]);

  const filteredDoctors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return doctors;
    return doctors.filter((doctor) =>
      [doctor.name, doctor.specialization, doctor.department, doctor.qualification]
        .some((value) => String(value ?? '').toLowerCase().includes(query)),
    );
  }, [doctors, searchQuery]);

  const totalActive = displayTokens.filter((t) => t.status === 'serving' || t.status === 'approaching').length;
  const avgWait = displayTokens.length > 0 ? Math.round(displayTokens.reduce((s, t) => s + t.estWaitMin, 0) / displayTokens.length) : 0;

  return (
    <div className="pc min-h-[calc(100vh-4rem)] bg-[var(--pc-page)] py-6 px-4 sm:px-6 lg:px-8 text-[var(--pc-text)]">

      {/* Header */}
      <div className="max-w-7xl mx-auto w-full mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.14] text-white transition-all cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold font-display text-white flex items-center gap-2">
                <Activity className="w-6 h-6 text-[#2E37A4]" />
                Live Patient Tracker
              </h1>
              <p className="text-xs text-white/50 mt-0.5">
                {segment === 'patients'
                  ? `${displayTokens.length} patients in queue • ${totalActive} active • Avg wait ${avgWait} min`
                  : `${filteredDoctors.length} doctors • Assigned by the facility administrator`}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="w-full sm:w-80 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={segment === 'patients' ? 'Search patient, token, service...' : 'Search doctor, specialization...'}
              className="w-full pl-10 pr-4 py-3 text-xs glass-input rounded-2xl placeholder-white/40 text-white"
            />
          </div>
        </div>
      </div>

      {/* Patients / Doctors Switcher */}
      <div className="max-w-7xl mx-auto w-full mb-5">
        <SegmentedSwitcher value={segment} onChange={setSegment} />
      </div>

      {/* Status Legend */}
      {segment === 'patients' && (
        <div className="max-w-7xl mx-auto w-full mb-6 flex flex-wrap gap-3 text-xs">
          {Object.entries(statusConfig).map(([key, cfg]) => (
            <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.border} border`}>
              <span className={`w-1.5 h-1.5 rounded-full ${key === 'serving' ? 'bg-emerald-400 animate-pulse' : key === 'approaching' ? 'bg-amber-400 animate-pulse' : 'bg-blue-400'}`} />
              <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content Grid */}
      <div className="max-w-7xl mx-auto w-full">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={segment}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {segment === 'patients' ? (
              displayTokens.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-white/40 text-sm">
                  <div className="text-center space-y-2">
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-8 h-8 mx-auto opacity-40 animate-spin" />
                        <p>Loading the live queue…</p>
                      </>
                    ) : searchQuery ? (
                      <>
                        <Search className="w-8 h-8 mx-auto opacity-40" />
                        <p>No patients match "{searchQuery}"</p>
                      </>
                    ) : (
                      /* An empty queue is a real state, not a failed search.
                         This branch previously read: No patients match "". */
                      <>
                        <Users className="w-8 h-8 mx-auto opacity-40" />
                        <p>Nobody is waiting right now.</p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayTokens.map((token) => (
                    <PatientCard
                      key={token.id}
                      token={token}
                      onClick={() => openRow(token)}
                      onRefreshWait={(updated) => onUpdateToken(updated)}
                    />
                  ))}
                </div>
              )
            ) : filteredDoctors.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-white/40 text-sm">
                <div className="text-center space-y-2">
                  {isDoctorsLoading ? (
                    <RefreshCw className="w-8 h-8 mx-auto opacity-40 animate-spin" />
                  ) : (
                    <>
                      <Stethoscope className="w-8 h-8 mx-auto opacity-40" />
                      <p>{searchQuery ? `No doctors match "${searchQuery}"` : 'No doctors have been assigned yet.'}</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDoctors.map((doctor) => (
                  <DoctorCard key={doctor.id} doctor={doctor} />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {appointmentRow && (
        <DoctorAppointmentModal
          row={appointmentRow}
          onClose={() => setAppointmentRow(null)}
          onChanged={() => {
            // The move is already live for everyone else through the event
            // stream; this repaints the board the doctor is looking at.
            // Nudging the search term re-runs the fetch effect, which is the
            // same path the poller and the live stream use.
            setSearchQuery((q) => (q === '' ? '' : q));
            setRefreshNonce((n) => n + 1);
          }}
        />
      )}

    </div>
  );
};
