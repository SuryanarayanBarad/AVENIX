import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Hash,
  PlayCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { DoctorAppointment } from '../../types';
import { doctorApi } from '../../services/doctorApi';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { DenyReasonModal } from './DenyReasonModal';

const listEase = [0.22, 1, 0.36, 1] as const;

/** Actions offered per state, mirroring lib/appointmentState.ts. */
const actionsFor = (status: string): { label: string; next: string; tone: string; icon: React.FC<{ className?: string }> }[] => {
  switch (status) {
    case 'Pending':
      return [
        { label: 'Approve', next: 'Approved', tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25', icon: CheckCircle2 },
        { label: 'Deny', next: 'Denied', tone: 'text-rose-300 bg-rose-500/15 border-rose-500/30 hover:bg-rose-500/25', icon: XCircle },
      ];
    case 'Approved':
    case 'Scheduled':
    case 'CheckedIn':
    case 'Waiting':
      return [
        { label: 'Start consultation', next: 'InConsultation', tone: 'text-[#5B63C4] bg-[#2E37A4]/15 border-[#2E37A4]/30 hover:bg-[#2E37A4]/25', icon: PlayCircle },
      ];
    case 'InConsultation':
      return [
        { label: 'Mark completed', next: 'Completed', tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25', icon: CheckCircle2 },
      ];
    default:
      return [];
  }
};

const statusTone: Record<string, string> = {
  Pending: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Scheduled: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  InConsultation: 'bg-[#2E37A4]/20 text-[#5B63C4] border-[#2E37A4]/30',
  Completed: 'bg-white/10 text-white/70 border-white/15',
  Denied: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

interface RequestsViewProps {
  refreshKey?: number;
  onChanged?: () => void;
}

/**
 * Requests — the Command Center's `requests` tab.
 *
 * Bookings arrive as Pending and wait here for the doctor's decision. Actions
 * carry the row `version`, so if the same appointment is acted on from two
 * places the second attempt is refused and the list reloads rather than one
 * decision silently overwriting the other.
 */
export const RequestsView: React.FC<RequestsViewProps> = ({ refreshKey = 0, onChanged }) => {
  const shouldReduceMotion = useReducedMotion();
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Declining opens the reason picker instead of firing straight away.
  const [denyTarget, setDenyTarget] = useState<DoctorAppointment | null>(null);
  const [denyError, setDenyError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      setAppointments(await doctorApi.getAppointments());
    } catch (err: any) {
      setError(err.message || 'Your appointment requests could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // A booking arriving, or a colleague acting on one, shows up at once.
  useLiveUpdates(() => { load(); });

  const act = async (appointment: DoctorAppointment, next: string, denial?: { reasonId: string; reasonNote?: string }) => {
    // A denial has to say why, so it routes through the reason picker first.
    if (next === 'Denied' && !denial) {
      setDenyError(null);
      setDenyTarget(appointment);
      return;
    }

    setBusyId(appointment.id);
    setError(null);
    try {
      await doctorApi.updateAppointmentStatus(appointment.id, next, appointment.version, denial);
      setDenyTarget(null);
      await load();
      onChanged?.();
    } catch (err: any) {
      // A conflict means the appointment moved underneath us — show why, then
      // reload so the doctor is looking at the real current state.
      if (denial) {
        setDenyError(err.message || 'That appointment could not be declined.');
      } else {
        setError(err.message || 'That change could not be applied.');
        await load();
      }
    } finally {
      setBusyId(null);
    }
  };

  const pending = appointments.filter(a => a.status === 'Pending');
  const visible = filter === 'pending' ? pending : appointments;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      <div className="glass-panel-elevated rounded-3xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <h2 className="text-base font-bold text-white font-display flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-amber-300" />
            Appointment Requests
            {pending.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {pending.length} awaiting you
              </span>
            )}
          </h2>

          <div className="flex items-center gap-2">
            <div className="flex bg-white/[0.06] p-1 rounded-xl border border-white/[0.12] gap-1">
              {(['pending', 'all'] as const).map(option => (
                <button
                  key={option}
                  onClick={() => setFilter(option)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize cursor-pointer ${
                    filter === option
                      ? 'bg-gradient-to-r from-[#2E37A4]/30 to-purple-500/30 text-white font-bold border border-[#2E37A4]/50'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.08] border border-transparent'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              onClick={load}
              title="Refresh"
              className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={`${filter}-${loading}`}
            className="divide-y divide-white/[0.06]"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: listEase }}
          >
            {loading ? (
              <div className="p-8 text-center text-white/50 text-sm">Loading requests...</div>
            ) : visible.length === 0 ? (
              <div className="p-8 text-center text-white/50 text-sm">
                {filter === 'pending' ? 'No requests are waiting for your decision.' : 'No appointments yet.'}
              </div>
            ) : (
              visible.map(apt => (
                <div
                  key={apt.id}
                  className="p-4 sm:p-5 hover:bg-white/[0.03] transition-colors flex flex-col lg:flex-row gap-3 lg:items-center justify-between"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{apt.patientName}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusTone[apt.status] || 'bg-white/10 text-white/70 border-white/15'}`}>
                        {apt.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-white/55">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {apt.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {apt.time}</span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3.5 h-3.5" /> <span className="font-mono text-white/75">{apt.code}</span>
                      </span>
                    </div>
                    <p className="text-xs text-white/70">
                      <span className="text-white/40">Reason:</span> {apt.reasonForVisit}
                    </p>
                    {apt.status === 'Denied' && (apt as any).statusReason && (
                      <p className="text-xs text-rose-300/90">
                        <span className="text-white/40">Declined because:</span> {(apt as any).statusReason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {actionsFor(apt.status).map(action => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.next}
                          disabled={busyId === apt.id}
                          onClick={() => act(apt, action.next)}
                          className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${action.tone}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {action.label}
                        </button>
                      );
                    })}
                    {actionsFor(apt.status).length === 0 && (
                      <span className="text-xs text-white/35">No further action</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <DenyReasonModal
        isOpen={!!denyTarget}
        patientName={denyTarget?.patientName}
        appointmentCode={denyTarget?.code}
        isSubmitting={busyId === denyTarget?.id}
        error={denyError}
        onCancel={() => { setDenyTarget(null); setDenyError(null); }}
        onConfirm={(reasonId, reasonNote) => {
          if (denyTarget) act(denyTarget, 'Denied', { reasonId, reasonNote });
        }}
      />
    </div>
  );
};
