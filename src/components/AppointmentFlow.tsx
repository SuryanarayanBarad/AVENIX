import React, { useEffect, useMemo, useState } from 'react';
import { serviceDayKey } from '../../lib/serviceDay';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Phone,
  RefreshCw,
  Hourglass,
  Send,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from 'lucide-react';

export interface DoctorOption {
  id: string;
  name: string;
  department: string;
  status?: 'Available' | 'Busy' | 'Delayed' | 'Unavailable';
  delayMinutes?: number;
  /** Public profile fields, populated by /api/visitor/doctors. */
  specialization?: string;
  photoUrl?: string | null;
  qualification?: string | null;
  experienceYears?: number;
  consultationFee?: number;
}

export interface SpecializationOption {
  id: string;
  name: string;
  doctorCount: number;
}

export interface AppointmentRequest {
  doctorId: string;
  date: string;
  time: string;
  patientName: string;
  phone: string;
  reasonForVisit: string;
  existingDiagnosis?: string;
}

/** Public DTO for one visitor's own appointment. It intentionally omits raw phone and other patients. */
export interface PublicAppointment {
  id: string;
  appointmentId: string;
  doctorId: string;
  doctor: string;
  department: string;
  date: string;
  time: string;
  patientName: string;
  reasonForVisit: string;
  phoneMasked: string;
  /** Plain-language state from lib/appointmentState.ts (toPatientStatus). */
  status: 'Awaiting approval' | 'Confirmed' | 'Scheduled' | 'Updated' | 'Checked in' | 'Waiting' | 'In consultation' | 'Completed' | 'Delayed' | 'Declined' | 'Cancelled' | 'Missed';
  /** Raw lifecycle status, for callers that need the enum. */
  lifecycleStatus?: string;
  awaitingApproval?: boolean;
  accessKey?: string;
  notification?: {
    id: string;
    type: 'appointment-updated';
    previousTime: string;
    newTime: string;
    status: 'Pending' | 'Confirmed' | 'Another time requested';
  };
}

interface AppointmentFlowProps {
  doctors: DoctorOption[];
  initialAppointment?: PublicAppointment | null;
  onGetSlots: (doctorId: string, date: string) => Promise<string[]> | string[];
  onCreateAppointment: (request: AppointmentRequest) => Promise<PublicAppointment> | PublicAppointment;
  onRefreshAppointment?: (appointmentId: string) => Promise<PublicAppointment> | PublicAppointment;
  onRequestAnotherTime?: (appointment: PublicAppointment) => Promise<PublicAppointment> | PublicAppointment;
  onAppointmentCreated?: (appointment: PublicAppointment) => void;
  onBack?: () => void;
  /**
   * The signed-in visitor, when there is one. Their name and phone prefill the
   * form and a desk booking is allowed to omit the phone.
   */
  user?: { id?: string; name?: string; email?: string; phone?: string; role?: string } | null;
}

import { visitorApi } from '../services/queueApi';

const today = serviceDayKey();

const statusClass: Record<PublicAppointment['status'], string> = {
  'Awaiting approval': 'border-amber-400/30 bg-amber-500/15 text-amber-100',
  Confirmed: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200',
  Scheduled: 'border-[#2E37A4]/35 bg-[#2E37A4]/15 text-[#dedaff]',
  Updated: 'border-amber-400/30 bg-amber-500/15 text-amber-100',
  'Checked in': 'border-amber-400/30 bg-amber-500/15 text-amber-100',
  Waiting: 'border-amber-400/30 bg-amber-500/15 text-amber-100',
  'In consultation': 'border-[#2E37A4]/35 bg-[#2E37A4]/15 text-[#dedaff]',
  Completed: 'border-white/[0.16] bg-white/[0.07] text-white/70',
  Delayed: 'border-amber-400/30 bg-amber-500/15 text-amber-100',
  Declined: 'border-rose-400/30 bg-rose-500/15 text-rose-100',
  Cancelled: 'border-rose-400/30 bg-rose-500/15 text-rose-100',
  Missed: 'border-rose-400/30 bg-rose-500/15 text-rose-100',
};

const formatDate = (date: string) => {
  const value = new Date(`${date}T12:00:00`);
  return Number.isNaN(value.getTime())
    ? date
    : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(value);
};

/**
 * A deliberately separate public appointment journey. No health diagnosis is
 * required; the clinical context field is labelled as symptoms/reason only.
 */
export const AppointmentFlow: React.FC<AppointmentFlowProps> = ({
  doctors,
  user = null,
  initialAppointment = null,
  onGetSlots,
  onCreateAppointment,
  onRefreshAppointment,
  onRequestAnotherTime,
  onAppointmentCreated,
  onBack,
}) => {
  const [step, setStep] = useState<'doctor' | 'date' | 'time' | 'details' | 'confirmed' | 'reschedule'>(initialAppointment ? 'confirmed' : 'doctor');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [existingDiagnosis, setExistingDiagnosis] = useState('');
  const [appointment, setAppointment] = useState<PublicAppointment | null>(initialAppointment);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  // The directory is refetched whenever this screen opens, so a doctor the
  // Super Admin assigned a moment ago is bookable straight away rather than
  // waiting for a page reload.
  const [liveDoctors, setLiveDoctors] = useState<DoctorOption[]>(doctors);
  const [specializations, setSpecializations] = useState<SpecializationOption[]>([]);
  const [specialization, setSpecialization] = useState<string>('all');
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  const loadDirectory = async () => {
    setIsLoadingDirectory(true);
    try {
      const [directory, specs] = await Promise.all([
        visitorApi.getDoctorDirectory(date),
        visitorApi.getSpecializations().catch(() => []),
      ]);
      setLiveDoctors(directory as DoctorOption[]);
      setSpecializations(specs);
    } catch {
      // Keep whatever the parent seeded us with rather than emptying the list.
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  useEffect(() => {
    loadDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parent-supplied doctors still seed the list on first paint.
  useEffect(() => {
    if (doctors.length > 0) {
      setLiveDoctors((current) => (current.length === 0 ? doctors : current));
    }
  }, [doctors]);

  const availableDoctors = liveDoctors.length > 0 ? liveDoctors : doctors;

  const visibleDoctors = useMemo(() => (
    specialization === 'all'
      ? availableDoctors
      : availableDoctors.filter((candidate) => (candidate.specialization ?? candidate.department) === specialization)
  ), [availableDoctors, specialization]);

  const doctor = useMemo(() => availableDoctors.find((candidate) => candidate.id === doctorId), [doctorId, availableDoctors]);

  /**
   * Keep the selected doctor consistent with what is on screen.
   *
   * This was two effects that fought each other: one cleared the selection when
   * a specialization filter hid the chosen doctor, the other immediately
   * re-selected doctors[0] — which the same filter hid again. Whenever the
   * filter excluded the first doctor the pair ping-ponged every render, and the
   * whole form visibly flickered while the patient was typing their name or
   * picking a date.
   *
   * One effect, and it converges: it only ever selects a doctor that is
   * visible, so the next run finds nothing to change.
   */
  useEffect(() => {
    if (visibleDoctors.length === 0) {
      if (doctorId) setDoctorId('');
      return;
    }
    const stillVisible = visibleDoctors.some((candidate) => candidate.id === doctorId);
    if (!stillVisible) {
      setDoctorId(visibleDoctors[0].id);
    }
  }, [visibleDoctors, doctorId]);

  // A signed-in visitor should not retype what their account already holds.
  useEffect(() => {
    if (!user) return;
    setPatientName((current) => current || user.name || '');
    setPhone((current) => current || user.phone || '');
  }, [user]);

  useEffect(() => {
    if (initialAppointment) {
      setAppointment(initialAppointment);
      setStep('confirmed');
    }
  }, [initialAppointment]);



  const loadSlots = async () => {
    if (!doctorId || !date) return;
    setError(null);
    setIsLoadingSlots(true);
    try {
      const nextSlots = await onGetSlots(doctorId, date);
      setSlots(nextSlots);
      setTime((current) => nextSlots.includes(current) ? current : nextSlots[0] ?? '');
    } catch (slotError) {
      setSlots([]);
      setTime('');
      setError(slotError instanceof Error ? slotError.message : 'Available times could not be loaded. Please try again.');
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const moveToTime = async () => {
    await loadSlots();
    setStep('time');
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!doctorId || !date || !time || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const created = await onCreateAppointment({
        doctorId,
        date,
        time,
        patientName: patientName.trim(),
        phone: phone.trim(),
        reasonForVisit: reasonForVisit.trim(),
        existingDiagnosis: existingDiagnosis.trim() || undefined,
      });
      setAppointment(created);
      setStep('confirmed');
      onAppointmentCreated?.(created);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'We could not confirm this appointment. Please choose another time.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshAppointment = async () => {
    if (!appointment || !onRefreshAppointment || isRefreshing) return;
    setError(null);
    setIsRefreshing(true);
    try {
      const before = appointment.status;
      const next = await onRefreshAppointment(appointment.appointmentId);
      setAppointment(next);
      // Refreshing usually returns exactly what is already on screen, so
      // without saying so the button looks broken: the spinner flashes and
      // nothing moves. Say what was found, and whether it changed.
      setRefreshNote(
        next.status === before
          ? `Checked just now — still ${String(before).toLowerCase()}.`
          : `Updated: now ${String(next.status).toLowerCase()}.`,
      );
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'We could not refresh your appointment. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const requestAnotherTime = async () => {
    if (!appointment || !onRequestAnotherTime) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const updated = await onRequestAnotherTime(appointment);
      setAppointment(updated);
      setRequestSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'We could not send your request. Please contact the facility.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBack = () => {
    setError(null);
    if (step === 'doctor') {
      onBack?.();
    } else if (step === 'date') {
      setStep('doctor');
    } else if (step === 'time') {
      setStep('date');
    } else if (step === 'details') {
      setStep('time');
    } else if (step === 'reschedule') {
      setStep('confirmed');
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] px-4 py-5 text-white sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-[28px] glass-panel-elevated shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.12] bg-white/[0.035] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {step !== 'confirmed' && (
              <button type="button" onClick={goBack} className="rounded-xl border border-white/[0.13] bg-white/[0.06] p-2 text-white/75 hover:bg-white/[0.13] hover:text-white cursor-pointer" aria-label="Back">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#2E37A4] to-[#3538CD] shadow-lg shadow-[#2E37A4]/20">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-white">CityCare Central Hospital</p>
              <p className="text-[11px] text-white/55">Doctor appointment</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-200">Private visit</span>
        </header>

        {!['confirmed', 'reschedule'].includes(step) && (
          <ol className="grid grid-cols-4 gap-1 border-b border-white/[0.10] px-5 py-3 text-center text-[9px] font-semibold uppercase tracking-wide sm:px-6" aria-label="Appointment booking progress">
            {(['doctor', 'date', 'time', 'details'] as const).map((item, index) => (
              <li key={item} className={step === item ? 'text-[#5B63C4]' : 'text-white/40'}>{index + 1}. {item === 'details' ? 'Details' : item}</li>
            ))}
          </ol>
        )}

        <div className="p-5 sm:p-6">
          {step === 'doctor' && (
            <section aria-labelledby="doctor-title">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 id="doctor-title" className="font-display text-2xl font-bold tracking-tight text-white">Choose a doctor</h1>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">Appointments are separate from walk-in queue tokens.</p>
                </div>
                <button
                  type="button"
                  onClick={loadDirectory}
                  title="Refresh doctor list"
                  className="mt-1 shrink-0 rounded-xl border border-white/[0.14] bg-white/[0.06] p-2 text-white/65 hover:bg-white/[0.12] hover:text-white cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingDirectory ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
              </div>

              {/* Specialization filter — every specialization the hospital has,
                  with All first. Ones with no doctor assigned are shown but
                  cannot be selected, so the filter is never a dead end. */}
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter doctors by specialization">
                <button
                  type="button"
                  onClick={() => setSpecialization('all')}
                  aria-pressed={specialization === 'all'}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                    specialization === 'all'
                      ? 'border-[#2E37A4]/55 bg-[#2E37A4]/20 text-white'
                      : 'border-white/[0.14] bg-white/[0.05] text-white/70 hover:bg-white/[0.10] hover:text-white'
                  }`}
                >
                  All <span className="ml-1 text-white/45">{availableDoctors.length}</span>
                </button>

                {specializations.map((spec) => {
                  const active = specialization === spec.name;
                  const empty = spec.doctorCount === 0;
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      disabled={empty}
                      onClick={() => setSpecialization(spec.name)}
                      aria-pressed={active}
                      title={empty ? 'No doctors assigned to this specialization yet' : undefined}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                        active
                          ? 'border-[#2E37A4]/55 bg-[#2E37A4]/20 text-white'
                          : 'border-white/[0.14] bg-white/[0.05] text-white/70 hover:bg-white/[0.10] hover:text-white'
                      }`}
                    >
                      {spec.name} <span className="ml-1 text-white/45">{spec.doctorCount}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 space-y-2.5">
                {visibleDoctors.length === 0 && (
                  <p className="rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-5 text-center text-xs text-white/55">
                    {isLoadingDirectory
                      ? 'Loading doctors…'
                      : specialization === 'all'
                        ? 'No doctors are available for booking yet.'
                        : `No doctors are assigned to ${specialization} yet.`}
                  </p>
                )}
                {visibleDoctors.map((candidate) => {
                  const selected = candidate.id === doctorId;
                  const unavailable = candidate.status === 'Unavailable';
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      disabled={unavailable}
                      onClick={() => setDoctorId(candidate.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${selected ? 'border-[#2E37A4]/55 bg-[#2E37A4]/18' : 'border-white/[0.10] bg-white/[0.035] hover:border-white/[0.22] hover:bg-white/[0.07]'}`}
                      aria-pressed={selected}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="flex items-start gap-3">
                          {candidate.photoUrl ? (
                            <img src={candidate.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl border border-white/20 object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#2E37A4]/30 bg-[#2E37A4]/15 text-[#5B63C4]"><Stethoscope className="h-4 w-4" aria-hidden="true" /></span>
                          )}
                          <span>
                            <span className="block text-sm font-bold text-white">{candidate.name}</span>
                            <span className="mt-0.5 block text-[11px] text-white/55">
                              {candidate.specialization ?? candidate.department}
                              {candidate.qualification ? ` · ${candidate.qualification}` : ''}
                              {candidate.experienceYears ? ` · ${candidate.experienceYears} yrs` : ''}
                            </span>
                          </span>
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${candidate.status === 'Delayed' ? 'border-amber-400/30 bg-amber-500/15 text-amber-200' : candidate.status === 'Unavailable' ? 'border-rose-400/30 bg-rose-500/15 text-rose-100' : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'}`}>{candidate.status ?? 'Available'}{candidate.delayMinutes ? ` · +${candidate.delayMinutes}m` : ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button type="button" disabled={!doctorId} onClick={() => setStep('date')} className="mt-5 flex w-full items-center justify-center gap-2 pc-btn-primary px-4 py-3.5 text-[13px] font-semibold disabled:opacity-50 cursor-pointer">Choose date <ArrowRight className="h-4 w-4" /></button>
            </section>
          )}

          {step === 'date' && (
            <section aria-labelledby="date-title">
              <h1 id="date-title" className="font-display text-2xl font-bold tracking-tight text-white">Select a date</h1>
              <p className="mt-1 text-xs leading-relaxed text-white/60">For {doctor?.name ?? 'your selected doctor'}.</p>
              <label className="mt-5 block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-white/80"><CalendarDays className="h-3.5 w-3.5 text-[var(--pc-primary)]" />Appointment date</span><input type="date" min={today} required value={date} onChange={(event) => setDate(event.target.value)} className="glass-input w-full rounded-2xl px-4 py-3 text-sm" /></label>
              <button type="button" onClick={moveToTime} className="mt-5 flex w-full items-center justify-center gap-2 pc-btn-primary px-4 py-3.5 text-[13px] font-semibold cursor-pointer">View available times <ArrowRight className="h-4 w-4" /></button>
            </section>
          )}

          {step === 'time' && (
            <section aria-labelledby="time-title">
              <div className="flex items-start justify-between gap-3"><div><h1 id="time-title" className="font-display text-2xl font-bold tracking-tight text-white">Available times</h1><p className="mt-1 text-xs leading-relaxed text-white/60">{doctor?.name} · {formatDate(date)}</p></div><button type="button" onClick={loadSlots} className="rounded-xl border border-white/[0.13] bg-white/[0.06] p-2 text-white/70 hover:bg-white/[0.12] cursor-pointer" aria-label="Refresh availability"><RefreshCw className={`h-4 w-4 ${isLoadingSlots ? 'animate-spin' : ''}`} /></button></div>
              {isLoadingSlots ? <div className="flex min-h-32 items-center justify-center text-xs text-white/60"><LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[var(--pc-primary)]" />Checking availability…</div> : slots.length ? <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">{slots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} className={`rounded-2xl border px-3 py-3 text-xs font-bold cursor-pointer ${time === slot ? 'liquid-glass-active border-transparent' : 'liquid-glass border-transparent text-[var(--pc-text-muted)]'}`}>{slot}</button>)}</div> : <p className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">No appointment times are available for this date. Choose another date or doctor.</p>}
              {error && <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3 py-2.5 text-xs text-rose-100" role="alert">{error}</p>}
              <button type="button" disabled={!time || isLoadingSlots} onClick={() => setStep('details')} className="mt-5 flex w-full items-center justify-center gap-2 pc-btn-primary px-4 py-3.5 text-[13px] font-semibold disabled:opacity-50 cursor-pointer">Continue <ArrowRight className="h-4 w-4" /></button>
            </section>
          )}

          {step === 'details' && (
            <form onSubmit={submit} noValidate aria-labelledby="details-title">
              <h1 id="details-title" className="font-display text-2xl font-bold tracking-tight text-white">Patient details</h1>
              <p className="mt-1 text-xs leading-relaxed text-white/60">{doctor?.name} · {formatDate(date)} · {time}</p>
              <div className="mt-5 space-y-4">
                <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-white/80"><UserRound className="h-3.5 w-3.5 text-[var(--pc-primary)]" />Patient name</span><input required value={patientName} onChange={(event) => setPatientName(event.target.value)} autoComplete="name" maxLength={100} placeholder="Full name" className="glass-input w-full rounded-2xl px-4 py-3 text-sm placeholder:text-white/35" /></label>
                <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-white/80"><Phone className="h-3.5 w-3.5 text-emerald-300" />Phone number</span><input required value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" maxLength={30} placeholder="For appointment updates" className="glass-input w-full rounded-2xl px-4 py-3 text-sm placeholder:text-white/35" /></label>
                <label className="block"><span className="mb-1.5 text-xs font-semibold text-white/80">Reason for Visit / Symptoms</span><textarea required value={reasonForVisit} onChange={(event) => setReasonForVisit(event.target.value)} maxLength={600} rows={3} placeholder="e.g. Fever and persistent cough for 3 days" className="glass-input w-full resize-none rounded-2xl px-4 py-3 text-sm placeholder:text-white/35" /></label>
                <label className="block"><span className="mb-1.5 text-xs font-semibold text-white/80">Existing Diagnosis <span className="font-normal text-white/40">(optional)</span></span><input value={existingDiagnosis} onChange={(event) => setExistingDiagnosis(event.target.value)} maxLength={300} placeholder="Only if you would like to share it" className="glass-input w-full rounded-2xl px-4 py-3 text-sm placeholder:text-white/35" /></label>
              </div>
              {error && <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3 py-2.5 text-xs text-rose-100" role="alert">{error}</p>}
              <p className="mt-4 flex gap-2 text-[11px] leading-relaxed text-white/48"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />Your visit reason is visible only to authorised clinical staff. A unique appointment ID is allocated after confirmation.</p>
              <button type="submit" disabled={isSubmitting} className="mt-5 flex w-full items-center justify-center gap-2 pc-btn-primary px-4 py-3.5 text-[13px] font-semibold disabled:opacity-70 cursor-pointer">{isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}{isSubmitting ? 'Confirming appointment…' : 'Confirm appointment'}</button>
            </form>
          )}

          {step === 'confirmed' && appointment && (
            <section className="space-y-4" aria-live="polite" aria-labelledby="appointment-confirmed-title">
              <div className="text-center"><span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border ${appointment.awaitingApproval ? 'border-amber-400/35 bg-amber-500/15 text-amber-200' : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300'}`}>{appointment.awaitingApproval ? <Hourglass className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}</span><p className={`mt-3 text-xs font-bold uppercase tracking-[0.16em] ${appointment.awaitingApproval ? 'text-amber-200' : 'text-emerald-300'}`}>{appointment.awaitingApproval ? 'Request sent to the doctor' : 'Appointment confirmed'}</p><h1 id="appointment-confirmed-title" className="mt-1 font-mono text-3xl font-black tracking-tight text-white">{appointment.appointmentId}</h1><span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass[appointment.status]}`}>{appointment.status}</span>
                {/* Without this the screen simply ends, and a patient who then
                    looks at the live tracker finds nothing and assumes the
                    booking failed. A request that is waiting on a doctor is
                    deliberately not in the queue yet, so say so. */}
                <p className="mx-auto mt-3 max-w-xs text-[11px] leading-relaxed text-[var(--pc-text-muted)]">
                  {appointment.awaitingApproval
                    ? 'It is not in the queue yet — the doctor reviews it first. You will see it in the live tracker once it is approved, and we will tell you either way.'
                    : 'Arrive a little before your time. You will appear in the live tracker on the day of your appointment.'}
                </p></div>
              <dl className="overflow-hidden rounded-[20px] border border-[var(--pc-border)] bg-[var(--pc-surface)] text-sm"><DetailRow label="Doctor" value={appointment.doctor} /><DetailRow label="Department" value={appointment.department} /><DetailRow label="Date" value={formatDate(appointment.date)} /><DetailRow label="Time" value={appointment.time} /><DetailRow label="Patient" value={appointment.patientName} /><DetailRow label="Reason for Visit" value={appointment.reasonForVisit} /><DetailRow label="Phone" value={appointment.phoneMasked} /></dl>
              {appointment.notification && <div className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">Appointment updated</p><p className="mt-1 text-xs leading-relaxed text-white/75">Your appointment with {appointment.doctor} was moved from <strong className="text-white">{appointment.notification.previousTime}</strong> to <strong className="text-white">{appointment.notification.newTime}</strong>.</p><p className="mt-2 text-[10px] text-white/45">Notification status: {appointment.notification.status}</p></div>}
              {error && <p className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3 py-2.5 text-xs text-rose-100" role="alert">{error}</p>}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"><button type="button" onClick={refreshAppointment} disabled={!onRefreshAppointment || isRefreshing} className="liquid-glass flex items-center justify-center gap-2 rounded-md px-4 py-3 text-[13px] font-medium text-[var(--pc-text)] disabled:opacity-55 cursor-pointer"><RefreshCw className={`h-3.5 w-3.5 text-[var(--pc-primary)] ${isRefreshing ? 'animate-spin' : ''}`} />{isRefreshing ? 'Checking…' : 'Check status'}</button><button type="button" onClick={() => setStep('reschedule')} className="pc-btn-primary flex items-center justify-center gap-2 px-4 py-3 text-[13px] font-medium cursor-pointer"><Clock3 className="h-3.5 w-3.5" />Reschedule</button></div>
              {refreshNote && (
                <p className="mt-2 text-center text-[11px] text-[var(--pc-text-muted)]">{refreshNote}</p>
              )}
            </section>
          )}

          {step === 'reschedule' && appointment && (
            <section aria-labelledby="reschedule-title"><button type="button" onClick={goBack} data-plain className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-white/55 hover:text-white cursor-pointer"><ArrowLeft className="h-3.5 w-3.5" />Back to appointment</button><h1 id="reschedule-title" className="font-display text-2xl font-bold tracking-tight text-white">Request another time</h1><p className="mt-1 text-xs leading-relaxed text-white/60">We’ll ask the scheduling team to contact you with suitable times. This does not change your appointment automatically.</p><div className="mt-5 rounded-3xl border border-white/[0.12] bg-white/[0.045] p-4 text-xs"><p className="font-bold text-white">Current appointment</p><p className="mt-1 text-white/60">{appointment.doctor} · {formatDate(appointment.date)} · {appointment.time}</p></div>{requestSent ? <div className="mt-5 rounded-3xl border border-emerald-400/30 bg-emerald-500/12 p-4 text-xs leading-relaxed text-emerald-100"><CheckCircle2 className="mb-2 h-5 w-5 text-emerald-300" />Your request has been sent. The appointment remains scheduled until the team confirms a change.</div> : <button type="button" disabled={isSubmitting} onClick={requestAnotherTime} className="mt-5 flex w-full items-center justify-center gap-2 pc-btn-primary px-4 py-3.5 text-[13px] font-semibold disabled:opacity-70 cursor-pointer"><Send className="h-4 w-4" />{isSubmitting ? 'Sending request…' : 'Request another time'}</button>}{error && <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3 py-2.5 text-xs text-rose-100">{error}</p>}</section>
          )}
        </div>
      </div>
    </main>
  );
};

/**
 * One line of the confirmation card.
 *
 * The label and value were text-white/42 and /88 — opacities written for a
 * dark card, and two the bridge did not map, so on a white card the whole block
 * was blank. Explicit tokens instead, and the columns stack below `xs`: 8.5rem
 * of label on a 360px phone left almost nothing for a doctor's name.
 */
const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border-b border-[var(--pc-border)] px-4 py-2.5 last:border-b-0 xs:grid xs:grid-cols-[7.5rem_1fr] xs:items-baseline xs:gap-3">
    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">{label}</dt>
    <dd className="mt-0.5 text-[13px] font-medium leading-relaxed text-[var(--pc-text)] xs:mt-0">{value}</dd>
  </div>
);
