import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Hourglass,
  RefreshCw,
  Stethoscope,
  Ticket,
  Users,
} from 'lucide-react';
import { visitorApi } from '../../services/queueApi';
import type { PublicQueueToken } from '../VisitorFlow';

interface MyAppointment {
  id: string;
  code: string;
  date: string;
  time: string;
  doctor: string;
  doctorPhotoUrl?: string | null;
  department: string;
  reasonForVisit: string;
  status: string;
  lifecycleStatus: string;
  /** The doctor's stated reason for a denial, shown to the patient. */
  statusReason?: string | null;
  awaitingApproval: boolean;
  inQueue: boolean;
  upcoming: boolean;
}

interface MyVisitViewProps {
  refreshKey?: number;
  onGetToken?: () => void;
  onBookAppointment?: () => void;
}

const statusTone: Record<string, string> = {
  'Awaiting approval': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Confirmed': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Checked in': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Waiting': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'In consultation': 'bg-[#2E37A4]/20 text-[#5B63C4] border-[#2E37A4]/30',
  'Completed': 'bg-white/10 text-white/60 border-white/15',
  'Declined': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'Cancelled': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

/** Doctor thumbnail with the app's gradient initials fallback. */
const DoctorThumb: React.FC<{ name: string; photoUrl?: string | null }> = ({ name, photoUrl }) => {
  const [failed, setFailed] = useState(false);
  const initials = name.replace(/^Dr\.?\s*/i, '').split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();

  if (photoUrl && !failed) {
    return <img src={photoUrl} alt={name} onError={() => setFailed(true)} className="w-11 h-11 rounded-2xl object-cover border border-white/20 shrink-0" />;
  }
  return (
    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#2E37A4] to-[#00D3C7] flex items-center justify-center text-white font-bold text-xs border border-white/20 shrink-0">
      {initials || <Stethoscope className="w-4 h-4" />}
    </div>
  );
};

/**
 * My Visit — the Command Center's `my-visit` tab, and the only tab a patient
 * sees. It answers the three questions a patient actually has: where am I in
 * the queue, what is booked next, and who am I seeing.
 */
export const MyVisitView: React.FC<MyVisitViewProps> = ({ refreshKey = 0, onGetToken, onBookAppointment }) => {
  const [token, setToken] = useState<PublicQueueToken | null>(null);
  const [appointments, setAppointments] = useState<MyAppointment[]>([]);
  // Walk-in tokens are visits too; history used to omit them entirely.
  const [walkIns, setWalkIns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeToken, history] = await Promise.all([
        visitorApi.getMyActiveToken(),
        visitorApi.getMyVisitHistory().catch(() => ({ appointments: [], visits: [] })),
      ]);
      setToken(activeToken);
      setAppointments(history.appointments as MyAppointment[]);
      setWalkIns(history.visits);
    } catch (err: any) {
      setError(err.message || 'Your visit details could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const upcoming = appointments.filter(a => a.upcoming || a.awaitingApproval);
  const past = appointments.filter(a => !a.upcoming && !a.awaitingApproval);
  const nextAppointment = upcoming[upcoming.length - 1] ?? null;
  const completedCount = appointments.filter(a => a.lifecycleStatus === 'Completed').length
    + walkIns.filter(v => v.status === 'Completed').length;
  // Finished walk-ins belong in history alongside past appointments.
  const pastWalkIns = walkIns.filter(v => !v.active);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/50 text-sm">Loading your visit...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Live queue position */}
      <div className="glass-hero rounded-3xl p-5 sm:p-6">
        {token ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#b9b0ff]">Your queue token</p>
              <p className="mt-1 font-mono text-4xl font-black tracking-tight text-white">{token.code}</p>
              <p className="mt-1 text-xs text-white/65">{token.serviceName}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="glass-panel rounded-2xl px-4 py-3">
                <div className="text-2xl font-light text-white font-display">{token.peopleAhead}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mt-0.5">Ahead</div>
              </div>
              <div className="glass-panel rounded-2xl px-4 py-3">
                <div className="text-2xl font-light text-[#2E37A4] font-display">{token.estimatedWaitMinutes}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mt-0.5">Min wait</div>
              </div>
              <div className="glass-panel rounded-2xl px-4 py-3">
                <div className="text-sm font-bold text-emerald-300 font-display mt-1.5">{token.status}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mt-0.5">Status</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#b9b0ff]">No active queue token</p>
              <h3 className="mt-1 font-display text-xl font-bold text-white">You are not in a queue right now</h3>
              <p className="mt-1 text-xs text-white/60">Take a walk-in token or book a consultation to get started.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onGetToken && (
                <button
                  onClick={onGetToken}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#2E37A4] to-purple-600 text-white font-semibold text-xs shadow-lg shadow-[#2E37A4]/30 border border-white/20 cursor-pointer transition-all"
                >
                  <Ticket className="w-4 h-4" />
                  Get a token
                </button>
              )}
              {onBookAppointment && (
                <button
                  onClick={onBookAppointment}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.16] text-white font-semibold text-xs cursor-pointer transition-all"
                >
                  <CalendarDays className="w-4 h-4 text-emerald-300" />
                  Book appointment
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Next appointment + doctor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel rounded-3xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-300" />
              Next appointment
            </h3>
            <button onClick={load} title="Refresh" className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {nextAppointment ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-lg font-bold text-white">{nextAppointment.code}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusTone[nextAppointment.status] || 'bg-white/10 text-white/70 border-white/15'}`}>
                  {nextAppointment.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {nextAppointment.date}</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {nextAppointment.time}</span>
              </div>
              {nextAppointment.awaitingApproval && (
                <p className="flex items-start gap-2 text-xs text-amber-200/90 pt-1">
                  <Hourglass className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Waiting for {nextAppointment.doctor} to approve this request. You will join the queue once it is approved.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-white/50">Nothing booked yet.</p>
          )}
        </div>

        <div className="glass-panel rounded-3xl p-5">
          <h3 className="text-sm font-bold text-white font-display flex items-center gap-2 mb-3">
            <Stethoscope className="w-4 h-4 text-[#2E37A4]" />
            Your doctor
          </h3>
          {nextAppointment ? (
            <div className="flex items-center gap-3">
              <DoctorThumb name={nextAppointment.doctor} photoUrl={nextAppointment.doctorPhotoUrl} />
              <div className="min-w-0">
                <div className="font-bold text-white truncate">{nextAppointment.doctor}</div>
                <div className="text-xs text-[#b9b0ff] truncate">{nextAppointment.department}</div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-white/50">Book a consultation to be assigned a doctor.</p>
          )}

          <div className="mt-4 pt-4 border-t border-white/[0.08] flex items-center gap-4 text-xs text-white/55">
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {appointments.length} visits</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {completedCount} completed</span>
          </div>
        </div>
      </div>

      {/* Visit history */}
      <div className="glass-panel-elevated rounded-3xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/[0.08]">
          <h3 className="text-sm font-bold text-white font-display">Visit history</h3>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {past.length === 0 && pastWalkIns.length === 0 ? (
            <div className="p-6 text-center text-xs text-white/45">No past visits yet.</div>
          ) : (
            <>
            {pastWalkIns.map(visit => (
              <div key={visit.id} className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-white/60 shrink-0">
                    <Ticket className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{visit.serviceName}</div>
                    <div className="text-xs text-white/50 truncate">
                      {visit.date} · {visit.time} · <span className="font-mono">{visit.code}</span>
                      {visit.counterName ? ` · ${visit.counterName}` : ''}
                    </div>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 ${
                  visit.status === 'Completed'
                    ? 'bg-white/10 text-white/60 border-white/15'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}>
                  {visit.status === 'Completed' ? 'Walk-in' : visit.status}
                </span>
              </div>
            ))}
            {past.map(apt => (
              <div key={apt.id} className="p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <DoctorThumb name={apt.doctor} photoUrl={apt.doctorPhotoUrl} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{apt.doctor}</div>
                      <div className="text-xs text-white/50 truncate">{apt.date} · {apt.time} · <span className="font-mono">{apt.code}</span></div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 ${statusTone[apt.status] || 'bg-white/10 text-white/70 border-white/15'}`}>
                    {apt.status}
                  </span>
                </div>

                {/* The doctor's reason. It was recorded and shown on the
                    doctor's own screens, but never to the person it was about,
                    who saw only the word "Declined" and no way to find out why
                    or what to do next. */}
                {(apt.lifecycleStatus === 'Denied' || apt.status === 'Declined') && (
                  <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.08] px-3.5 py-2.5">
                    <p className="text-[11px] leading-relaxed text-rose-100/90">
                      <span className="font-semibold text-rose-200">Why: </span>
                      {apt.statusReason || 'No reason was given.'}
                    </p>
                    <p className="mt-1 text-[11px] text-white/55">
                      That time is free again — you can book another appointment whenever you like.
                    </p>
                  </div>
                )}
              </div>
            ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
