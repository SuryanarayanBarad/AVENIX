import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CalendarClock, Clock3, LoaderCircle, User as UserIcon, X, CheckCircle2 } from 'lucide-react';
import { doctorApi } from '../services/doctorApi';

const ease = [0.22, 1, 0.36, 1] as const;

export interface DoctorQueueRow {
  id: string;
  kind?: 'appointment' | 'token';
  appointmentId?: string;
  code: string;
  patientName: string;
  time?: string;
  date?: string;
  reasonForVisit?: string;
  appointmentStatus?: string;
  version?: number;
}

interface Props {
  row: DoctorQueueRow;
  onClose: () => void;
  onChanged?: () => void;
}

/**
 * What a doctor sees when they open one of their own appointments.
 *
 * Clicking an appointment in the tracker used to open the patient's token view,
 * which asked for a token by the appointment's id and was told there was no
 * such token. An appointment is not a token, so it gets its own panel — and the
 * thing a doctor actually wants to do here is move it, which previously only an
 * administrator could do.
 *
 * Ownership is enforced server-side: the doctor comes from the session, and the
 * appointment must already be theirs.
 */
export const DoctorAppointmentModal: React.FC<Props> = ({ row, onClose, onChanged }) => {
  const shouldReduceMotion = useReducedMotion();
  const appointmentId = row.appointmentId ?? row.id;

  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [newTime, setNewTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    doctorApi.getRescheduleSlots(appointmentId)
      .then((data) => {
        if (cancelled) return;
        setSlots(data.availableTimes ?? []);
        setNewTime(row.time && data.availableTimes?.includes(row.time) ? row.time : (data.availableTimes?.[0] ?? ''));
      })
      .catch((err) => { if (!cancelled) setError(err?.message ?? 'Available times could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [appointmentId, row.time]);

  const save = async () => {
    if (!newTime || saving) return;
    if (newTime === row.time) {
      setError('That is already the appointment time. Choose a different slot.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await doctorApi.rescheduleAppointment(appointmentId, newTime);
      setDone(`Moved to ${result.appointment.time}. The patient has been notified.`);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message ?? 'The appointment could not be moved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence initial={false}>
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0A1B39]/45 p-4 backdrop-blur-sm"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease }}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doctor-appointment-title"
          className="pc w-full max-w-md overflow-hidden rounded-[20px] border border-[var(--pc-border)] bg-[var(--pc-surface)] text-[var(--pc-text)]"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.985 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-[var(--pc-border)] px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--pc-text-subtle)]">
                Appointment
              </p>
              <h2 id="doctor-appointment-title" className="mt-0.5 text-lg font-bold">
                {row.code}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              data-plain
              className="rounded-md p-1.5 text-[var(--pc-text-subtle)] transition-colors hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-[var(--pc-text-muted)]">Patient</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                  <UserIcon className="h-3.5 w-3.5 text-[var(--pc-text-subtle)]" />
                  {row.patientName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--pc-text-muted)]">Current time</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                  <Clock3 className="h-3.5 w-3.5 text-[var(--pc-text-subtle)]" />
                  {row.time ?? '—'}
                </dd>
              </div>
              {row.date && (
                <div>
                  <dt className="text-xs text-[var(--pc-text-muted)]">Date</dt>
                  <dd className="mt-0.5 font-medium">{row.date}</dd>
                </div>
              )}
              {row.appointmentStatus && (
                <div>
                  <dt className="text-xs text-[var(--pc-text-muted)]">Status</dt>
                  <dd className="mt-0.5 font-medium">{row.appointmentStatus}</dd>
                </div>
              )}
            </dl>

            {row.reasonForVisit && (
              <p className="rounded-md bg-[var(--pc-page)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--pc-text-muted)]">
                <span className="font-semibold text-[var(--pc-text)]">Reason: </span>
                {row.reasonForVisit}
              </p>
            )}

            {done ? (
              <p className="flex items-start gap-2 rounded-md border border-[#A6E4C0] bg-[#E9F7EF] px-3.5 py-3 text-sm text-[var(--pc-success-text)]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {done}
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                    <CalendarClock className="h-3.5 w-3.5 text-[var(--pc-primary)]" />
                    Move to
                  </span>
                  {loadingSlots ? (
                    <span className="flex items-center gap-2 text-xs text-[var(--pc-text-muted)]">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      Checking your availability…
                    </span>
                  ) : slots.length === 0 ? (
                    <span className="block rounded-md border border-[#F3C08A] bg-[#FEF3E7] px-3.5 py-2.5 text-xs text-[#B54708]">
                      You have no free slots left on this date.
                    </span>
                  ) : (
                    <select
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="pc-input h-9 w-full px-3 text-sm cursor-pointer"
                    >
                      {slots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}{slot === row.time ? ' (current)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </label>

                {error && (
                  <p className="rounded-md border border-[var(--pc-danger-soft,#F78F8E)] bg-[#FEF3F2] px-3.5 py-2.5 text-xs font-medium text-[var(--pc-danger-text)]">
                    {error}
                  </p>
                )}

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="pc-btn-ghost h-[38px] flex-1 text-sm font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || loadingSlots || slots.length === 0}
                    className="pc-btn-primary h-[38px] flex-1 text-sm font-medium cursor-pointer disabled:opacity-60"
                  >
                    {saving ? 'Moving…' : 'Move appointment'}
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
