import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';

type DoctorStatus = 'Available' | 'Busy' | 'Delayed' | 'Unavailable';

export interface DoctorScheduleAppointment {
  id: string;
  tokenCode: string;
  patientName: string;
  time: string;
  date: string;
  doctor: string;
  status: string;
  service: string;
  estWaitMin: number;
  phoneMasked?: string;
  reasonForVisit?: string;
}

export interface DoctorScheduleViewProps {
  appointments: DoctorScheduleAppointment[];
  onAppointmentUpdated?: (appointment: any) => void;
  onAdminAction?: (action: string, payload: any) => Promise<any> | any;
}

interface RecommendationRow {
  appointment: DoctorScheduleAppointment;
  newTime: string;
}

interface NotificationState {
  appointment: DoctorScheduleAppointment;
  previousTime: string;
  newTime: string;
  doctor: string;
  response: 'awaiting' | 'confirmed' | 'another-time';
}

import { adminApi } from '../services/queueApi';

const modalEase = [0.22, 1, 0.36, 1] as const;

const statusTone: Record<DoctorStatus, string> = {
  Available: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300',
  Busy: 'border-[#8e7dff]/35 bg-[#8e7dff]/15 text-[#c5beff]',
  Delayed: 'border-amber-400/30 bg-amber-500/15 text-amber-200',
  Unavailable: 'border-rose-400/35 bg-rose-500/15 text-rose-200',
};

const appointmentTone = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes('complete')) return 'border-white/[0.12] bg-white/[0.06] text-white/55';
  if (normalized.includes('consult') || normalized.includes('busy')) return 'border-[#8e7dff]/35 bg-[#8e7dff]/15 text-[#c5beff]';
  if (normalized.includes('delay')) return 'border-amber-400/30 bg-amber-500/15 text-amber-200';
  if (normalized.includes('wait') || normalized.includes('check')) return 'border-amber-400/30 bg-amber-500/15 text-amber-200';
  return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200';
};

const isSharma = (doctor: string) => doctor.toLowerCase().includes('sharma');

/**
 * Staff-only schedule workspace. It purposely keeps the AI plan read-only
 * until an operator opens the review modal and explicitly confirms a change.
 */
export const DoctorScheduleView: React.FC<DoctorScheduleViewProps> = ({
  appointments,
  onAppointmentUpdated,
  onAdminAction,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [selectedDoctor, setSelectedDoctor] = useState('Dr. Sharma');
  const [showRecommendation, setShowRecommendation] = useState(true);
  const [rescheduleTarget, setRescheduleTarget] = useState<DoctorScheduleAppointment | null>(null);
  const [newTime, setNewTime] = useState('12:00 PM');
  const [newDoctor, setNewDoctor] = useState('Dr. Sharma');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const [localUpdates, setLocalUpdates] = useState<Record<string, DoctorScheduleAppointment>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Real schedule: doctors, their recorded availability windows, and the
  // appointments that actually fall inside a blocked window.
  const [schedule, setSchedule] = useState<any[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const today = new Date().toISOString().slice(0, 10);
    adminApi.getDoctorSchedule(today)
      .then((result: any) => {
        if (!mounted) return;
        setSchedule(result?.doctors ?? []);
        setScheduleError(null);
      })
      .catch((err: any) => {
        if (mounted) setScheduleError(err?.message || 'The doctor schedule could not be loaded.');
      });
    return () => { mounted = false; };
  }, []);

  const resolvedAppointments = useMemo(
    () => appointments.map((appointment) => localUpdates[appointment.id] ?? appointment),
    [appointments, localUpdates],
  );

  /** Flatten the live schedule into the row shape this view renders. */
  const liveAppointments = useMemo<DoctorScheduleAppointment[]>(() => (
    schedule.flatMap((entry: any) => (entry.appointments ?? []).map((apt: any) => ({
      id: apt.id,
      tokenCode: apt.code,
      patientName: apt.patientName,
      time: apt.time,
      date: apt.date,
      doctor: entry.doctor.name,
      status: apt.status,
      service: entry.doctor.department,
      estWaitMin: 0,
      phoneMasked: apt.maskedPhone,
      reasonForVisit: apt.reasonForVisit,
    })))
  ), [schedule]);

  /** Appointment ids the server flagged as sitting inside a blocked window. */
  const conflictingIds = useMemo(
    () => new Set(schedule.flatMap((entry: any) => entry.conflictingAppointmentIds ?? [])),
    [schedule],
  );

  // Only genuinely affected appointments are offered for rescheduling, so a
  // review always targets a row that exists in the database.
  const affectedAppointments = useMemo(
    () => liveAppointments
      .filter((appointment) => conflictingIds.has(appointment.id))
      .map((appointment) => localUpdates[appointment.id] ?? appointment),
    [liveAppointments, conflictingIds, localUpdates],
  );

  const recommendationRows = useMemo<RecommendationRow[]>(() => (
    affectedAppointments.slice(0, 3).map((appointment, index) => ({
      appointment,
      newTime: ['12:00 PM', '12:30 PM', '01:00 PM'][index] ?? appointment.time,
    }))
  ), [affectedAppointments]);

  const selectedSchedule = useMemo(() => {
    const fromLive = liveAppointments
      .filter((appointment) => appointment.doctor === selectedDoctor)
      .map((appointment) => localUpdates[appointment.id] ?? appointment);
    if (fromLive.length > 0) return fromLive;
    // Fall back to whatever the parent passed in (kept for standalone use).
    return resolvedAppointments.filter((appointment) => appointment.doctor === selectedDoctor);
  }, [liveAppointments, localUpdates, resolvedAppointments, selectedDoctor]);

  const doctors = useMemo(() => schedule.map((entry: any) => {
    const blocked = (entry.availability ?? []).find((window: any) => window.status === 'Unavailable' || window.status === 'Delayed');
    const detail = blocked
      ? blocked.status === 'Delayed'
        ? `Running ${blocked.delayMinutes ?? 0} minutes behind (${blocked.displayWindow})`
        : `Conflict ${blocked.displayWindow}`
      : blocked?.note
        || (entry.status === 'Busy' ? 'In consultation' : 'No conflicts recorded today');

    return {
      name: entry.doctor.name,
      department: entry.doctor.department,
      status: entry.status as DoctorStatus,
      detail,
      count: (entry.appointments ?? []).length,
    };
  }), [schedule]);

  // Keep the selection pointing at a doctor that actually exists.
  useEffect(() => {
    if (doctors.length > 0 && !doctors.some((doc) => doc.name === selectedDoctor)) {
      setSelectedDoctor(doctors[0].name);
    }
  }, [doctors, selectedDoctor]);

  /** The first real blocked window today, used for the alert headline. */
  const conflictSummary = useMemo(() => {
    for (const entry of schedule) {
      const blocked = (entry.availability ?? []).find((w: any) => w.status === 'Unavailable' || w.status === 'Delayed');
      if (blocked && (entry.conflictingAppointmentIds ?? []).length > 0) {
        return {
          headline: blocked.status === 'Delayed'
            ? `${entry.doctor.name} is running ${blocked.delayMinutes ?? 0} minutes behind (${blocked.displayWindow}).`
            : `${entry.doctor.name} is unavailable from ${blocked.displayWindow}.`,
        };
      }
    }
    return null;
  }, [schedule]);

  const openRescheduleReview = (row: RecommendationRow) => {
    // Reviewing the suggestion is intentionally a local, non-mutating step.
    setRescheduleTarget(row.appointment);
    setNewTime(row.newTime);
    setNewDoctor('Dr. Sharma');
    setModalError(null);
  };

  const handleConfirmReschedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rescheduleTarget || isSaving) return;

    const previousTime = rescheduleTarget.time;
    const updatedAppointment: DoctorScheduleAppointment = {
      ...rescheduleTarget,
      time: newTime,
      doctor: newDoctor,
      status: 'Scheduled',
      estWaitMin: 0,
    };

    setIsSaving(true);
    setModalError(null);
    try {
      await onAdminAction?.('appointment.reschedule.approved', {
        appointmentId: rescheduleTarget.id,
        appointmentCode: rescheduleTarget.tokenCode,
        previousTime,
        newTime,
        previousDoctor: rescheduleTarget.doctor,
        newDoctor,
        source: 'doctor-schedule-ai-review',
      });

      // Parent state is notified only after the explicit confirmation above.
      setLocalUpdates((current) => ({ ...current, [updatedAppointment.id]: updatedAppointment }));
      onAppointmentUpdated?.(updatedAppointment);
      setNotification({
        appointment: updatedAppointment,
        previousTime,
        newTime,
        doctor: newDoctor,
        response: 'awaiting',
      });
      setRescheduleTarget(null);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'The appointment could not be rescheduled. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotificationResponse = async (response: 'confirmed' | 'another-time') => {
    if (!notification) return;
    const updatedNotification = { ...notification, response } as NotificationState;
    setNotification(updatedNotification);
    try {
      await onAdminAction?.(
        response === 'confirmed' ? 'notification.patient-confirmed' : 'notification.patient-requested-another-time',
        {
          appointmentId: notification.appointment.id,
          appointmentCode: notification.appointment.tokenCode,
          channel: 'mock',
        },
      );
    } catch {
      // The visible status is still useful for demo environments where the
      // notification adapter has not been connected yet.
    }
  };

  const showActionNotice = (notice: string, action: string) => {
    setActionNotice(notice);
    void Promise.resolve(onAdminAction?.(action, {
      doctor: 'Dr. Sharma',
      affectedAppointmentIds: affectedAppointments.map((appointment) => appointment.id),
    })).catch(() => undefined);
  };

  return (
    <div className="space-y-6 pb-12 text-white">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-white">Doctor Schedule Control</h1>
            <span className="rounded-full border border-[#8e7dff]/30 bg-[#8e7dff]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#c5beff]">Staff workspace</span>
          </div>
          <p className="mt-1 text-xs text-white/60">Availability, appointment impact, and reviewable AI rescheduling recommendations.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowRecommendation((visible) => !visible)}
          className="flex self-start items-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#4F46E5]/25 transition-all cursor-pointer sm:self-auto"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {showRecommendation ? 'Hide AI plan' : 'View AI plan'}
        </button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Schedule summary">
        <MetricCard icon={<Stethoscope className="h-4 w-4 text-[#c5beff]" />} label="Doctors on duty" value={`${doctors.length}`} detail="1 availability conflict" />
        <MetricCard icon={<CalendarClock className="h-4 w-4 text-emerald-300" />} label="Affected appointments" value={`${affectedAppointments.length}`} detail="Requires management review" />
        <MetricCard icon={<Clock3 className="h-4 w-4 text-amber-300" />} label="Dr. Sharma delay" value="28 min" detail="Estimated disruption: low" />
        <MetricCard icon={<Users className="h-4 w-4 text-rose-300" />} label="Alternate capacity" value="1 doctor" detail="Dr. Priya Nair available" />
      </section>

      {scheduleError && (
        <section className="rounded-3xl border border-rose-400/35 bg-rose-500/[0.11] p-4 text-xs text-rose-200 backdrop-blur-xl">
          {scheduleError}
        </section>
      )}

      {conflictSummary ? (
      <section className="rounded-3xl border border-rose-400/35 bg-rose-500/[0.11] p-5 shadow-[0_12px_40px_rgba(244,63,94,0.10)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-400/35 bg-rose-500/20 text-rose-200">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-200">Doctor availability conflict</p>
              <h2 className="mt-1 font-display text-base font-bold text-white">{conflictSummary.headline}</h2>
              <p className="mt-1 text-xs leading-relaxed text-white/72"><strong className="text-white">{affectedAppointments.length} appointment{affectedAppointments.length === 1 ? ' is' : 's are'} affected.</strong> Review the proposed changes before communicating a new consultation time.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button type="button" disabled={recommendationRows.length === 0} onClick={() => recommendationRows[0] && openRescheduleReview(recommendationRows[0])} className="rounded-xl border border-rose-200/25 bg-white/[0.09] px-3 py-2 text-[11px] font-bold text-white hover:bg-white/[0.15] disabled:opacity-50 cursor-pointer">Reschedule affected</button>
            <button type="button" onClick={() => showActionNotice('Dr. Priya Nair has been surfaced as an alternate option. No appointment was changed.', 'schedule.find-alternate-doctor')} className="rounded-xl border border-white/[0.14] bg-white/[0.05] px-3 py-2 text-[11px] font-semibold text-white/85 hover:bg-white/[0.12] cursor-pointer">Find another doctor</button>
            <button type="button" onClick={() => showActionNotice('An extension request is ready for management review. No schedule was changed.', 'schedule.request-consultation-extension')} className="rounded-xl border border-white/[0.14] bg-white/[0.05] px-3 py-2 text-[11px] font-semibold text-white/85 hover:bg-white/[0.12] cursor-pointer">Extend hours</button>
          </div>
        </div>
        {actionNotice && <p className="mt-4 rounded-2xl border border-white/[0.12] bg-black/10 px-3.5 py-2.5 text-[11px] text-white/75" role="status">{actionNotice}</p>}
      </section>
      ) : (
        <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 backdrop-blur-xl">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">Availability</p>
              <h2 className="mt-1 font-display text-base font-bold text-white">No availability conflicts today.</h2>
              <p className="mt-1 text-xs leading-relaxed text-white/70">
                Every appointment on today's schedule sits inside its doctor's available hours. Mark a doctor Delayed or
                Unavailable to see the affected appointments listed here.
              </p>
              {actionNotice && <p className="mt-3 rounded-2xl border border-white/[0.12] bg-black/10 px-3.5 py-2.5 text-[11px] text-white/75" role="status">{actionNotice}</p>}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="space-y-4 xl:col-span-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {doctors.map((doctor) => {
              const active = selectedDoctor === doctor.name;
              return (
                <button
                  key={doctor.name}
                  type="button"
                  onClick={() => setSelectedDoctor(doctor.name)}
                  className={`rounded-3xl border p-4 text-left transition-all cursor-pointer ${
                    active ? 'border-[#8e7dff]/55 bg-[#8e7dff]/16 shadow-[0_10px_30px_rgba(142,125,255,0.15)]' : 'glass-panel hover:border-white/[0.22]'
                  }`}
                  aria-pressed={active}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.13] bg-white/[0.07] text-[#c5beff]"><Stethoscope className="h-5 w-5" aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-white">{doctor.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-white/55">{doctor.department}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${statusTone[doctor.status]}`}>{doctor.status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.09] pt-3 text-[10px] text-white/55">
                    <span>{doctor.detail}</span>
                    <span className="font-mono text-white/75">{doctor.count} booked</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-3xl glass-panel-elevated">
            <div className="flex flex-col gap-3 border-b border-white/[0.10] bg-white/[0.035] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-white">{selectedDoctor} schedule</h2>
                <p className="mt-0.5 text-[11px] text-white/55">Appointment detail is visible only in this authorized staff workspace.</p>
              </div>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-white/70">Today</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.025] text-[10px] font-bold uppercase tracking-wider text-white/45">
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Appointment / patient</th>
                    <th className="px-5 py-3">Service</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {selectedSchedule.length > 0 ? selectedSchedule.map((appointment) => {
                    const recommendation = recommendationRows.find((row) => row.appointment.id === appointment.id);
                    return (
                      <tr key={appointment.id} className="hover:bg-white/[0.035]">
                        <td className="whitespace-nowrap px-5 py-4 font-mono font-bold text-white">{appointment.time}</td>
                        <td className="px-5 py-4">
                          <span className="block font-bold text-[#c5beff]">{appointment.tokenCode}</span>
                          <span className="mt-0.5 block font-semibold text-white">{appointment.patientName}</span>
                          {appointment.reasonForVisit && <span className="mt-1 block max-w-[230px] truncate text-[10px] text-white/48" title={appointment.reasonForVisit}>Reason: {appointment.reasonForVisit}</span>}
                        </td>
                        <td className="px-5 py-4 text-white/70">{appointment.service}</td>
                        <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${appointmentTone(appointment.status)}`}>{appointment.status}</span></td>
                        <td className="px-5 py-4 text-right">
                          {recommendation ? (
                            <button type="button" onClick={() => openRescheduleReview(recommendation)} className="inline-flex items-center gap-1 rounded-xl border border-[#8e7dff]/35 bg-[#8e7dff]/15 px-2.5 py-1.5 text-[10px] font-bold text-[#d6d2ff] hover:bg-[#8e7dff]/25 cursor-pointer">
                              Review change <ChevronRight className="h-3 w-3" aria-hidden="true" />
                            </button>
                          ) : <span className="text-[10px] text-white/35">No change proposed</span>}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-white/45">No appointments are scheduled for this doctor.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="space-y-4 xl:col-span-4">
          <AnimatePresence initial={false}>
            {showRecommendation && (
              <motion.section
                className="rounded-3xl border border-[#8e7dff]/35 bg-gradient-to-br from-[#8e7dff]/18 via-[#7C3AED]/10 to-white/[0.045] p-5 shadow-xl shadow-[#4F46E5]/10 backdrop-blur-xl"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: modalEase }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#c5beff]/30 bg-[#8e7dff]/20 text-[#d6d2ff]"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d6d2ff]">AI suggestion</p>
                    <h2 className="mt-1 font-display text-base font-bold text-white">Reviewable recovery plan</h2>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-white/72">
                  {conflictSummary
                    ? <>{conflictSummary.headline} The following changes are recommendations only; nothing updates until management approves each change.</>
                    : <>No appointments are currently affected by an availability conflict.</>}
                </p>

                <div className="mt-4 space-y-2.5">
                  {recommendationRows.length === 0 && (
                    <p className="rounded-2xl border border-white/[0.12] bg-black/10 px-3.5 py-3 text-[11px] text-white/55">
                      Nothing to reschedule right now.
                    </p>
                  )}
                  {recommendationRows.map((row) => (
                    <button key={row.appointment.id} type="button" onClick={() => openRescheduleReview(row)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.12] bg-black/10 px-3.5 py-3 text-left hover:bg-white/[0.08] cursor-pointer">
                      <span>
                        <span className="block font-mono text-[10px] font-bold text-[#d6d2ff]">{row.appointment.tokenCode}</span>
                        <span className="mt-0.5 block text-[11px] text-white/65">{row.appointment.time} <ArrowRight className="mx-1 inline h-3 w-3 text-[#c5beff]" aria-hidden="true" /> {row.newTime}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/45" aria-hidden="true" />
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/[0.12] pt-3 text-[11px]">
                  <span className="text-white/55">Expected disruption</span>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">Low</span>
                </div>
                <button type="button" disabled={recommendationRows.length === 0} onClick={() => recommendationRows[0] && openRescheduleReview(recommendationRows[0])} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] px-4 py-3 text-xs font-bold text-white shadow-lg shadow-[#4F46E5]/20 disabled:opacity-50 cursor-pointer">
                  Review first affected appointment <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </motion.section>
            )}
          </AnimatePresence>

          {notification && (
            <section className="rounded-3xl border border-emerald-400/35 bg-emerald-500/[0.11] p-5 shadow-lg shadow-emerald-500/10 backdrop-blur-xl" aria-live="polite">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"><BellRing className="h-5 w-5" aria-hidden="true" /></span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Appointment updated</p>
                  <h2 className="mt-1 font-display text-base font-bold text-white">Patient notification prepared</h2>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/72">Your appointment with <strong className="text-white">{notification.doctor}</strong> has been rescheduled.</p>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <NotificationMetric label="Previous" value={notification.previousTime} />
                <NotificationMetric label="New" value={notification.newTime} />
                <NotificationMetric label="Appointment ID" value={notification.appointment.tokenCode} />
                <NotificationMetric label="Phone" value={notification.appointment.phoneMasked || 'Masked contact'} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => handleNotificationResponse('confirmed')} className={`rounded-xl border px-3 py-2 text-[10px] font-bold cursor-pointer ${notification.response === 'confirmed' ? 'border-emerald-300/50 bg-emerald-500/25 text-emerald-100' : 'border-white/[0.15] bg-white/[0.07] text-white hover:bg-white/[0.13]'}`}>
                  {notification.response === 'confirmed' ? 'Confirmed' : 'Confirm'}
                </button>
                <button type="button" onClick={() => handleNotificationResponse('another-time')} className={`rounded-xl border px-3 py-2 text-[10px] font-bold cursor-pointer ${notification.response === 'another-time' ? 'border-amber-300/50 bg-amber-500/25 text-amber-100' : 'border-white/[0.15] bg-white/[0.07] text-white hover:bg-white/[0.13]'}`}>
                  Request another time
                </button>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[10px] text-white/55"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" /> Notification adapter ready for SMS, WhatsApp, email, or push.</p>
            </section>
          )}
        </aside>
      </div>

      <AnimatePresence initial={false}>
        {rescheduleTarget && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: modalEase }}
            onClick={() => !isSaving && setRescheduleTarget(null)}
          >
            <motion.form
              onSubmit={handleConfirmReschedule}
              className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/[0.20] bg-[#12122b]/95 text-white shadow-2xl glass-panel-elevated backdrop-blur-2xl"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reschedule-title"
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.10] bg-white/[0.04] p-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c5beff]">Management review</p>
                  <h2 id="reschedule-title" className="mt-1 font-display text-lg font-bold text-white">Review reschedule</h2>
                  <p className="mt-1 text-xs text-white/60">The appointment stays unchanged until you confirm.</p>
                </div>
                <button type="button" onClick={() => setRescheduleTarget(null)} disabled={isSaving} className="rounded-xl p-1.5 text-white/55 hover:bg-white/[0.10] hover:text-white disabled:opacity-40 cursor-pointer" aria-label="Close reschedule review"><X className="h-5 w-5" aria-hidden="true" /></button>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid grid-cols-2 gap-2.5">
                  <ReviewMetric label="Previous Time" value={rescheduleTarget.time} />
                  <ReviewMetric label="Affected Patient" value={`${rescheduleTarget.tokenCode} · ${rescheduleTarget.patientName}`} />
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-white/80">New Time</span>
                  <select value={newTime} onChange={(event) => setNewTime(event.target.value)} className="glass-input w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white bg-[#12122b] cursor-pointer">
                    {['11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM'].map((time) => <option key={time} value={time} className="bg-[#12122b] text-white">{time}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-white/80">Doctor</span>
                  <select value={newDoctor} onChange={(event) => setNewDoctor(event.target.value)} className="glass-input w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white bg-[#12122b] cursor-pointer">
                    <option value="Dr. Sharma" className="bg-[#12122b] text-white">Dr. Sharma — General Medicine</option>
                    <option value="Dr. Priya Nair" className="bg-[#12122b] text-white">Dr. Priya Nair — Available alternate</option>
                  </select>
                </label>

                <div className="rounded-2xl border border-[#8e7dff]/30 bg-[#8e7dff]/12 p-3.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-[#d6d2ff]"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI recommendation review</div>
                  <p className="mt-1.5 leading-relaxed text-white/70">Previous Time <strong className="text-white">{rescheduleTarget.time}</strong> <ArrowRight className="mx-1 inline h-3 w-3" aria-hidden="true" /> New Time <strong className="text-white">{newTime}</strong> · Doctor <strong className="text-white">{newDoctor}</strong></p>
                </div>

                {modalError && <p className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-100" role="alert">{modalError}</p>}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setRescheduleTarget(null)} disabled={isSaving} className="rounded-2xl border border-white/[0.13] bg-white/[0.07] px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/[0.13] disabled:opacity-50 cursor-pointer">Cancel review</button>
                  <button type="submit" disabled={isSaving} className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#4F46E5]/25 disabled:opacity-60 cursor-pointer">
                    {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    {isSaving ? 'Updating schedule…' : 'Confirm Reschedule'}
                  </button>
                </div>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; detail: string }> = ({ icon, label, value, detail }) => (
  <div className="rounded-3xl glass-panel-elevated p-4">
    <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-white/60">{label}</span>{icon}</div>
    <div className="mt-1 font-display text-2xl font-light text-white">{value}</div>
    <p className="mt-1 text-[10px] text-white/45">{detail}</p>
  </div>
);

const NotificationMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-white/[0.10] bg-black/10 px-2.5 py-2">
    <dt className="text-[9px] font-bold uppercase tracking-wide text-white/45">{label}</dt>
    <dd className="mt-0.5 truncate text-[11px] font-semibold text-white">{value}</dd>
  </div>
);

const ReviewMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-white/[0.11] bg-white/[0.045] p-3">
    <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">{label}</p>
    <p className="mt-1 truncate text-xs font-bold text-white">{value}</p>
  </div>
);
