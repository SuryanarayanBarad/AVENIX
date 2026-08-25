import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Calendar, Clock, Hash, ListOrdered, RefreshCw, Users } from 'lucide-react';
import { DoctorPatient } from '../../types';
import { doctorApi } from '../../services/doctorApi';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

const listEase = [0.22, 1, 0.36, 1] as const;

/** Colour per derived checkup state, using the app's existing status tones. */
const checkupTone: Record<string, string> = {
  'Completed': 'bg-[#2E37A4]/20 text-[#5B63C4] border-[#2E37A4]/30',
  'In consultation': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Waiting': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Checked in': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Declined': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'Cancelled': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'Awaiting approval': 'bg-white/10 text-white/70 border-white/15',
};

interface MyPatientsViewProps {
  /** Bumping this refetches — used by the live-update hook. */
  refreshKey?: number;
}

/**
 * My Patients — the Command Center's `my-patients` tab.
 *
 * Every row comes from /api/doctor/patients, which resolves the doctor from the
 * session. No doctorId is sent from the browser, so this list can only ever
 * contain the signed-in doctor's own patients.
 */
export const MyPatientsView: React.FC<MyPatientsViewProps> = ({ refreshKey = 0 }) => {
  const shouldReduceMotion = useReducedMotion();
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [scope, setScope] = useState<'today' | 'upcoming' | 'all'>('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (next: 'today' | 'upcoming' | 'all' = scope) => {
    try {
      setLoading(true);
      setError(null);
      const result = await doctorApi.getPatients(next);
      setPatients(result.patients);
    } catch (err: any) {
      setError(err.message || 'Your patient list could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, refreshKey]);

  // Queue and appointment changes repaint this list immediately.
  useLiveUpdates(() => { load(scope); });

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      <div className="glass-panel-elevated rounded-3xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <h2 className="text-base font-bold text-white font-display flex items-center gap-2">
            <Users className="w-4 h-4 text-[#2E37A4]" />
            My Patients
            <span className="text-xs font-medium text-white/45">({patients.length})</span>
          </h2>

          <div className="flex items-center gap-2">
            <div className="flex bg-white/[0.06] p-1 rounded-xl border border-white/[0.12] gap-1">
              {(['today', 'upcoming', 'all'] as const).map(option => (
                <button
                  key={option}
                  onClick={() => setScope(option)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize cursor-pointer ${
                    scope === option
                      ? 'bg-gradient-to-r from-[#2E37A4]/30 to-purple-500/30 text-white font-bold border border-[#2E37A4]/50'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.08] border border-transparent'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              onClick={() => load()}
              title="Refresh"
              className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={`${scope}-${loading}`}
            className="divide-y divide-white/[0.06]"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: listEase }}
          >
            {loading ? (
              <div className="p-8 text-center text-white/50 text-sm">Loading patients...</div>
            ) : patients.length === 0 ? (
              <div className="p-8 text-center text-white/50 text-sm">No patients assigned to you for this period.</div>
            ) : (
              patients.map(patient => (
                <div
                  key={patient.id}
                  className="p-4 sm:p-5 hover:bg-white/[0.03] transition-colors flex flex-col md:flex-row gap-3 md:items-center justify-between"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{patient.patientName}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${checkupTone[patient.checkupStatus] || 'bg-white/10 text-white/70 border-white/15'}`}>
                        {patient.checkupStatus}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-white/55">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {patient.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {patient.displayTime}</span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3.5 h-3.5" /> <span className="font-mono text-white/75">{patient.tokenCode}</span>
                      </span>
                      {patient.queuePosition !== null && (
                        <span className="flex items-center gap-1">
                          <ListOrdered className="w-3.5 h-3.5" /> Queue #{patient.queuePosition}
                        </span>
                      )}
                      <span className="text-white/40">{patient.phoneMasked}</span>
                    </div>
                    <p className="text-xs text-white/70">
                      <span className="text-white/40">Reason:</span> {patient.reasonForVisit}
                    </p>
                  </div>
                  <div className="text-xs text-white/50 shrink-0">
                    Appointment: <span className="text-white/80">{patient.status}</span>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
