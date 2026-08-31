import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Stethoscope,
  AlertCircle,
  X,
} from 'lucide-react';
import { visitorApi, adminApi } from '../services/queueApi';
import { useLiveUpdates } from '../hooks/useLiveUpdates';
import { serviceDayKey } from '../../lib/serviceDay';
import { APPOINTMENT_TRANSITIONS, describeStatus, type AppointmentStatus } from '../../lib/appointmentState';
import type { DoctorOption, SpecializationOption } from './AppointmentFlow';

const modalEase = [0.22, 1, 0.36, 1] as const;

/**
 * One appointment exactly as `GET /api/admin/appointments` projects it.
 *
 * This screen previously read the mock `Appointment` shape — `tokenCode`,
 * `demographic`, and display statuses like `"Checked In"`. Once the tab was
 * switched to real data none of those fields existed, and the search filter
 * called `.toLowerCase()` on an undefined `tokenCode`, which threw on every
 * render and blanked the whole tab for admins. Typing the row against the
 * response is what stops that recurring.
 */
export interface StaffAppointment {
  id: string;
  code: string;
  patientName: string;
  phoneMasked: string | null;
  doctorId: string;
  doctor: string;
  department: string;
  service: string;
  date: string;
  time: string;
  rawTime: string;
  reasonForVisit: string | null;
  status: AppointmentStatus;
  patientStatus: string;
  statusReason: string | null;
  awaitingApproval: boolean;
  inQueue: boolean;
  version: number;
  bookedAtDesk: boolean;
}

interface AppointmentsViewProps {
  onOpenCopilot: (prompt?: string) => void;
  /** Lets the shell refresh its pending badge when staff act on a request. */
  onChanged?: () => void;
}

/**
 * The moves staff can make from a given state, in the order they read on a
 * ward board. Every entry is checked against the shared transition table before
 * it renders, so this list can never offer a move the server would reject.
 */
const ACTIONS: { next: AppointmentStatus; label: string; icon: React.FC<{ className?: string }>; tone: string }[] = [
  { next: 'Approved', label: 'Approve', icon: CheckCircle2, tone: 'pc-btn-success' },
  { next: 'Denied', label: 'Deny', icon: XCircle, tone: 'pc-btn-danger' },
  { next: 'CheckedIn', label: 'Check in', icon: CheckCircle2, tone: 'liquid-glass' },
  { next: 'InConsultation', label: 'Call in', icon: PhoneCall, tone: 'liquid-glass' },
  { next: 'Completed', label: 'Complete', icon: CheckCircle2, tone: 'liquid-glass' },
];

/** Status pill colouring, keyed by the lifecycle status the API actually sends. */
const STATUS_TONE: Record<string, string> = {
  Pending: 'bg-[#FEF3E7] text-[#B54708] border-[#F5C08A]',
  Approved: 'bg-[var(--pc-tint-lilac)] text-[var(--pc-primary)] border-[#C7C9F0]',
  Scheduled: 'bg-[var(--pc-tint-lilac)] text-[var(--pc-primary)] border-[#C7C9F0]',
  CheckedIn: 'bg-[#E0F2FE] text-[var(--pc-info-text)] border-[#A5D8F0]',
  Waiting: 'bg-[#FEF3E7] text-[#B54708] border-[#F5C08A]',
  InConsultation: 'bg-[#E7F6EC] text-[var(--pc-success-text)] border-[#A6DCBB]',
  Completed: 'bg-[var(--pc-page)] text-[var(--pc-text-muted)] border-[var(--pc-border)]',
  Denied: 'bg-[#FEE4E2] text-[var(--pc-danger-text)] border-[#F2B8B5]',
  Cancelled: 'bg-[#FEE4E2] text-[var(--pc-danger-text)] border-[#F2B8B5]',
  Missed: 'bg-[#FEE4E2] text-[var(--pc-danger-text)] border-[#F2B8B5]',
  Delayed: 'bg-[#FEF3E7] text-[#B54708] border-[#F5C08A]',
};

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({ onOpenCopilot, onChanged }) => {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<number>(today.getDate());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [selectedService, setSelectedService] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Real appointments for the selected day.
  const [rows, setRows] = useState<StaffAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // New appointment form state
  const [newPatient, setNewPatient] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [newDoctorId, setNewDoctorId] = useState('');
  const [newSpecialization, setNewSpecialization] = useState<string>('All');
  const [newReason, setNewReason] = useState('');
  const [newTime, setNewTime] = useState('02:00 PM');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const [directory, setDirectory] = useState<DoctorOption[]>([]);
  const [specializations, setSpecializations] = useState<SpecializationOption[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  /** The day the calendar is pointed at, as the API's `YYYY-MM-DD`. */
  const selectedDay = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
  const isToday = selectedDay === serviceDayKey();

  const load = async () => {
    try {
      setLoadError(null);
      const result = await adminApi.getAppointments({ date: selectedDay });
      setRows(result.appointments as StaffAppointment[]);
    } catch (err: any) {
      setLoadError(err?.message || 'Appointments could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  // A booking arriving, or a colleague acting on one, shows up without a refresh.
  useLiveUpdates(() => { load(); });

  // The specialty filter lists the facility's real departments, so a
  // specialization added this morning is filterable this morning.
  useEffect(() => {
    let mounted = true;
    visitorApi.getSpecializations()
      .then((specs) => { if (mounted) setSpecializations(specs); })
      .catch(() => { /* the filter simply falls back to "All" */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!showAddModal) return;
    let mounted = true;
    setIsLoadingDirectory(true);
    visitorApi.getDoctorDirectory()
      .then((docs) => { if (mounted) setDirectory(docs as DoctorOption[]); })
      .catch(() => { if (mounted) setBookingError('The doctor list could not be loaded.'); })
      .finally(() => { if (mounted) setIsLoadingDirectory(false); });
    return () => { mounted = false; };
  }, [showAddModal]);

  const selectableDoctors = newSpecialization === 'All'
    ? directory
    : directory.filter((doc) => (doc.specialization ?? doc.department) === newSpecialization);

  useEffect(() => {
    if (newDoctorId && !selectableDoctors.some((doc) => doc.id === newDoctorId)) {
      setNewDoctorId('');
    }
  }, [selectableDoctors, newDoctorId]);

  /**
   * Search runs over every identifying field, not just three, and each one is
   * coerced before matching so a null phone or a missing reason can never throw
   * the way the old `apt.tokenCode.toLowerCase()` did.
   */
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((apt) => {
      const matchesSearch = !q || [
        apt.code, apt.patientName, apt.doctor, apt.department,
        apt.phoneMasked, apt.reasonForVisit, apt.time,
      ].some((field) => String(field ?? '').toLowerCase().includes(q));
      const matchesService = selectedService === 'All' || apt.department === selectedService;
      const matchesStatus = selectedStatus === 'All'
        || (selectedStatus === 'Pending' ? apt.awaitingApproval : apt.status === selectedStatus);
      return matchesSearch && matchesService && matchesStatus;
    });
  }, [rows, searchQuery, selectedService, selectedStatus]);

  // Every headline number is counted off the same rows the table renders, so the
  // tiles and the list can never disagree.
  const pendingCount = rows.filter((a) => a.awaitingApproval).length;
  const inQueueCount = rows.filter((a) => a.inQueue).length;
  const completedCount = rows.filter((a) => a.status === 'Completed').length;

  /** Specialties that actually have an appointment today, plus the current pick. */
  const serviceOptions = useMemo(() => {
    const present = new Set(rows.map((a) => a.department).filter(Boolean));
    const known = specializations.map((s) => s.name);
    return Array.from(new Set([...present, ...known])).sort();
  }, [rows, specializations]);

  const act = async (apt: StaffAppointment, next: AppointmentStatus) => {
    setBusyId(apt.id);
    setActionError(null);
    try {
      await adminApi.setAppointmentStatus(apt.id, next, { expectedVersion: apt.version });
      await load();
      onChanged?.();
    } catch (err: any) {
      // A conflict means somebody else moved it first — say so, then reload so
      // the board shows the state that actually won.
      setActionError(err?.message || 'That change could not be applied.');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handlePrevMonth = () => {
    if (currentYear === today.getFullYear() && currentMonth === today.getMonth()) return;
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  /**
   * Book a real appointment through the same service the patient flow uses, so
   * slot-conflict protection, a real code and the approval step all apply.
   */
  const handleCreateAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBooking) return;

    // Desk booking: a patient with no mobile can still be booked in. A number
    // that IS given must still be valid, so a typo is not read as "no contact".
    const cleanPhone = newPhone.replace(/[\s-()]/g, '');
    if (cleanPhone && !/^\d{10,}$/.test(cleanPhone)) {
      setPhoneError('Enter a valid phone number (min 10 digits), or leave it blank for a walk-up patient.');
      return;
    }
    setPhoneError('');

    const doctor = directory.find((doc) => doc.id === newDoctorId);
    if (!doctor) {
      setBookingError('Choose an attending physician.');
      return;
    }

    setIsBooking(true);
    setBookingError(null);
    try {
      await visitorApi.createAppointment({
        doctorId: doctor.id,
        date: selectedDay,
        time: newTime,
        patientName: newPatient.trim() || 'New Patient',
        phone: cleanPhone || undefined,
        reasonForVisit: newReason.trim() || 'Booked at the front desk',
      } as any);

      // Re-read rather than mirroring a guessed row into state: the server
      // assigns the code and the starting status, so only it knows the truth.
      await load();
      onChanged?.();

      setShowAddModal(false);
      setNewPatient('');
      setNewPhone('');
      setNewReason('');
      setNewDoctorId('');
    } catch (err: any) {
      setBookingError(err?.message || 'That appointment could not be booked.');
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div className="pc space-y-6 pb-12 text-[var(--pc-text)]">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold font-display text-[var(--pc-text)]">Appointments &amp; Doctor Schedules</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--pc-tint-lilac)] text-[var(--pc-primary)] border border-[#C7C9F0]">
              {loading ? '—' : `${rows.length} ${isToday ? 'today' : 'booked'}`}
            </span>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3E7] text-[#B54708] border border-[#F5C08A]">
                {pendingCount} awaiting approval
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--pc-text-muted)] mt-1">
            Pre-booked consultations, synchronised with the live queue and the arrival kiosks.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="pc-btn-primary px-4 py-2.5 text-xs flex items-center gap-2 active:scale-95 transition-all self-start sm:self-auto cursor-pointer font-semibold"
        >
          <Plus className="w-4 h-4" />
          <span>Book Appointment</span>
        </button>
      </div>

      {actionError && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#F5C08A] bg-[#FEF3E7] px-4 py-3 text-sm text-[#B54708]">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="font-medium">{actionError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left column: calendar & insight */}
        <div className="lg:col-span-4 space-y-6">

          <div className="pc-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative">
                <button
                  onClick={() => setShowMonthSelector(!showMonthSelector)}
                  className="font-bold text-sm font-display flex items-center gap-1 text-[var(--pc-text)] hover:text-[var(--pc-primary)] cursor-pointer"
                >
                  {new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
                </button>
                {showMonthSelector && (
                  <div className="absolute top-full left-0 mt-2 w-52 p-3 rounded-2xl bg-[var(--pc-surface)] border border-[var(--pc-border)] shadow-[var(--pc-shadow)] z-50">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <button
                        onClick={() => { if (currentYear > today.getFullYear()) setCurrentYear(currentYear - 1); }}
                        disabled={currentYear <= today.getFullYear()}
                        className={`p-1 rounded-md ${currentYear <= today.getFullYear() ? 'text-[var(--pc-border-strong)] cursor-not-allowed' : 'text-[var(--pc-text-muted)] hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)] cursor-pointer'}`}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-bold text-[var(--pc-text)]">{currentYear}</span>
                      <button
                        onClick={() => setCurrentYear(currentYear + 1)}
                        className="p-1 text-[var(--pc-text-muted)] hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)] rounded-md cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: 12 }, (_, i) => {
                        const isDisabled = currentYear === today.getFullYear() && i < today.getMonth();
                        return (
                          <button
                            key={i}
                            disabled={isDisabled}
                            onClick={() => { setCurrentMonth(i); setShowMonthSelector(false); }}
                            className={`text-xs py-1.5 rounded-lg font-medium ${
                              isDisabled
                                ? 'text-[var(--pc-border-strong)] cursor-not-allowed'
                                : currentMonth === i
                                  ? 'liquid-glass-active font-semibold'
                                  : 'text-[var(--pc-text-muted)] hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)] cursor-pointer'
                            }`}
                          >
                            {new Date(2000, i).toLocaleString('default', { month: 'short' })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevMonth}
                  disabled={currentYear === today.getFullYear() && currentMonth === today.getMonth()}
                  className={`p-1.5 rounded-xl transition-colors ${
                    currentYear === today.getFullYear() && currentMonth === today.getMonth()
                      ? 'text-[var(--pc-border-strong)] cursor-not-allowed'
                      : 'text-[var(--pc-text-muted)] hover:text-[var(--pc-text)] hover:bg-[var(--pc-page)] cursor-pointer'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 text-[var(--pc-text-muted)] hover:text-[var(--pc-text)] rounded-xl hover:bg-[var(--pc-page)] transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[var(--pc-text-subtle)] uppercase">
              <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {/* Lead the grid with blanks so each date lands under its weekday. */}
              {Array.from({ length: new Date(currentYear, currentMonth, 1).getDay() }, (_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {[...Array(new Date(currentYear, currentMonth + 1, 0).getDate())].map((_, index) => {
                const day = index + 1;
                const isSelected = selectedDate === day;
                const isCurrentDay = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(day)}
                    className={`py-2 rounded-xl font-medium transition-all relative cursor-pointer ${
                      isSelected
                        ? 'liquid-glass-active font-semibold'
                        : isCurrentDay
                          ? 'bg-[var(--pc-tint-lilac)] text-[var(--pc-primary)] font-bold border border-[#C7C9F0]'
                          : 'text-[var(--pc-text-muted)] hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)]'
                    }`}
                  >
                    <span>{day}</span>
                    {isCurrentDay && !isSelected && (
                      <span className="w-1 h-1 rounded-full bg-[var(--pc-primary)] mx-auto block mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Copilot insight — describes the day actually on screen. */}
          <div className="pc-card p-6 space-y-3">
            <div className="flex items-center gap-2 text-[var(--pc-primary)]">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">AI Schedule Intelligence</span>
            </div>
            <p className="text-xs text-[var(--pc-text-muted)] leading-relaxed">
              <strong className="text-[var(--pc-text)]">
                {rows.length} appointment{rows.length === 1 ? '' : 's'} on {selectedDay}
              </strong>
              {pendingCount > 0
                ? ` — ${pendingCount} still waiting on a doctor's decision.`
                : ' — every request has been actioned.'}
            </p>
            <button
              onClick={() => onOpenCopilot(`Analyse the doctor schedule for ${selectedDay} and identify delay risks`)}
              className="text-xs font-semibold text-[var(--pc-primary)] hover:text-[var(--pc-primary-bright)] flex items-center gap-1 pt-1 cursor-pointer transition-colors"
              data-plain
            >
              <span>Ask Schedule Copilot</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Right column: KPIs, filters, table */}
        <div className="lg:col-span-8 space-y-4">

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="pc-card p-5">
              <span className="text-xs text-[var(--pc-text-muted)] font-medium">Booked</span>
              <div className="text-2xl font-light font-display mt-0.5 text-[var(--pc-text)]">{rows.length}</div>
            </div>
            <div className="pc-card p-5">
              <span className="text-xs text-[var(--pc-text-muted)] font-medium">Awaiting approval</span>
              <div className="text-2xl font-light font-display mt-0.5 text-[#B54708]">{pendingCount}</div>
            </div>
            <div className="pc-card p-5">
              <span className="text-xs text-[var(--pc-text-muted)] font-medium">In queue</span>
              <div className="text-2xl font-light font-display mt-0.5 text-[var(--pc-primary)]">{inQueueCount}</div>
            </div>
            <div className="pc-card p-5">
              <span className="text-xs text-[var(--pc-text-muted)] font-medium">Completed</span>
              <div className="text-2xl font-light font-display mt-0.5 text-[var(--pc-success-text)]">{completedCount}</div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="pc-card p-4 flex flex-col lg:flex-row items-stretch lg:items-center gap-3 text-xs">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-[var(--pc-text-subtle)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search patient, doctor, specialty, code or phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pc-input w-full pl-9 pr-9 py-2 text-xs"
                aria-label="Search appointments"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  data-plain
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--pc-text-subtle)] hover:text-[var(--pc-text)] hover:bg-[var(--pc-page)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Specialty filter, built from the facility's real departments. */}
              <div className="relative">
                <Stethoscope className="w-3.5 h-3.5 text-[var(--pc-text-subtle)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  aria-label="Filter by specialization"
                  className="pc-input pl-8 pr-8 py-2 font-medium cursor-pointer"
                >
                  <option value="All">All specializations</option>
                  {serviceOptions.map((name) => (
                    <option key={name} value={name}>
                      {name} ({rows.filter((a) => a.department === name).length})
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                aria-label="Filter by status"
                className="pc-input pl-3 pr-8 py-2 font-medium cursor-pointer"
              >
                <option value="All">All statuses</option>
                <option value="Pending">Pending approval</option>
                <option value="Approved">Approved</option>
                <option value="CheckedIn">Checked in</option>
                <option value="InConsultation">In consultation</option>
                <option value="Completed">Completed</option>
                <option value="Denied">Denied</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="pc-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[var(--pc-page)] border-b border-[var(--pc-border)] text-[var(--pc-text-subtle)] font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-5">Time</th>
                    <th className="py-3.5 px-5">Code &amp; patient</th>
                    <th className="py-3.5 px-5">Specialty &amp; doctor</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--pc-border)]">
                  {loading && (
                    <tr><td colSpan={5} className="py-10 px-5 text-center text-[var(--pc-text-muted)]">Loading appointments…</td></tr>
                  )}

                  {!loading && loadError && (
                    <tr><td colSpan={5} className="py-10 px-5 text-center text-[var(--pc-danger-text)] font-medium">{loadError}</td></tr>
                  )}

                  {!loading && !loadError && filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 px-5 text-center text-[var(--pc-text-muted)]">
                        {rows.length === 0
                          ? `No appointments booked for ${selectedDay}.`
                          : 'No appointments match these filters.'}
                      </td>
                    </tr>
                  )}

                  {!loading && !loadError && filtered.map((apt) => {
                    const allowed = APPOINTMENT_TRANSITIONS[apt.status] ?? [];
                    const actions = ACTIONS.filter((a) => allowed.includes(a.next));

                    return (
                      <tr key={apt.id} className="hover:bg-[var(--pc-page)] transition-colors">
                        <td className="py-4 px-5 font-bold font-mono text-[var(--pc-text)] whitespace-nowrap">
                          {apt.time}
                        </td>

                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[var(--pc-primary)] font-mono">{apt.code}</span>
                            <span className="font-semibold text-[var(--pc-text)]">{apt.patientName}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-[var(--pc-text-subtle)]">
                            {apt.phoneMasked && <span className="font-mono">{apt.phoneMasked}</span>}
                            {apt.bookedAtDesk && <span className="font-medium">Desk booking</span>}
                          </div>
                        </td>

                        <td className="py-4 px-5">
                          <span className="font-medium block text-[var(--pc-text)]">{apt.doctor}</span>
                          <span className="text-[10px] text-[var(--pc-text-muted)]">{apt.department}</span>
                        </td>

                        <td className="py-4 px-5">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${
                            STATUS_TONE[apt.status] ?? 'bg-[var(--pc-page)] text-[var(--pc-text-muted)] border-[var(--pc-border)]'
                          }`}>
                            {describeStatus(apt.status)}
                          </span>
                          {apt.statusReason && (
                            <p className="text-[10px] text-[var(--pc-text-muted)] mt-1 max-w-[18ch]">{apt.statusReason}</p>
                          )}
                        </td>

                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {actions.length === 0 && (
                              <span className="text-[10px] text-[var(--pc-text-subtle)]">—</span>
                            )}
                            {actions.map((action) => {
                              const Icon = action.icon;
                              return (
                                <button
                                  key={action.next}
                                  onClick={() => act(apt, action.next)}
                                  disabled={busyId === apt.id}
                                  className={`${action.tone} px-3 py-1.5 rounded-xl font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                  <Icon className="w-3 h-3" />
                                  <span>{busyId === apt.id ? '…' : action.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* Book appointment modal */}
      <AnimatePresence initial={false}>
        {showAddModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1B39]/40 p-4 backdrop-blur-md"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: modalEase }}
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              className="pc-card w-full max-w-md overflow-hidden text-[var(--pc-text)]"
              role="dialog"
              aria-modal="true"
              aria-label="Book clinical appointment"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="p-6 bg-[var(--pc-page)] border-b border-[var(--pc-border)] flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg font-display text-[var(--pc-text)]">Book Clinical Appointment</h3>
                  <p className="text-xs text-[var(--pc-text-muted)]">Scheduling for {selectedDay}</p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  aria-label="Close"
                  data-plain
                  className="text-[var(--pc-text-muted)] hover:text-[var(--pc-text)] font-bold cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateAppointmentSubmit} className="p-6 space-y-4 text-xs">
                <div>
                  <label className="block font-bold mb-1.5 text-[var(--pc-text)]">Patient full name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vikram Patel"
                    value={newPatient}
                    onChange={(e) => setNewPatient(e.target.value)}
                    className="pc-input w-full px-4 py-2.5"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1.5 text-[var(--pc-text)]">
                    Phone number <span className="font-normal text-[var(--pc-text-muted)]">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="Leave blank if the patient has no phone"
                    value={newPhone}
                    onChange={(e) => { setNewPhone(e.target.value); if (phoneError) setPhoneError(''); }}
                    className={`pc-input w-full px-4 py-2.5 ${phoneError ? 'border-[var(--pc-danger)]' : ''}`}
                  />
                  {phoneError && (
                    <p className="text-[var(--pc-danger-text)] mt-1.5 text-[10px] font-medium">{phoneError}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold mb-1.5 text-[var(--pc-text)]">Time slot</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 02:30 PM"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="pc-input w-full px-4 py-2.5"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1.5 text-[var(--pc-text)]">Specialty</label>
                    <select
                      value={newSpecialization}
                      onChange={(e) => setNewSpecialization(e.target.value)}
                      className="pc-input w-full px-4 py-2.5 font-medium cursor-pointer"
                    >
                      <option value="All">All specializations ({directory.length})</option>
                      {specializations.map((spec) => (
                        <option key={spec.id} value={spec.name} disabled={spec.doctorCount === 0}>
                          {spec.name} ({spec.doctorCount})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold mb-1.5 text-[var(--pc-text)]">Attending physician</label>
                  <select
                    required
                    value={newDoctorId}
                    onChange={(e) => setNewDoctorId(e.target.value)}
                    disabled={isLoadingDirectory || selectableDoctors.length === 0}
                    className="pc-input w-full px-4 py-2.5 font-medium cursor-pointer disabled:opacity-60"
                  >
                    <option value="">
                      {isLoadingDirectory
                        ? 'Loading physicians…'
                        : selectableDoctors.length === 0
                          ? 'No physician assigned to this specialty'
                          : 'Select a physician…'}
                    </option>
                    {selectableDoctors.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name} ({doc.specialization ?? doc.department})
                        {doc.status && doc.status !== 'Available' ? ` — ${doc.status}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1.5 text-[var(--pc-text)]">Reason for visit</label>
                  <input
                    type="text"
                    placeholder="e.g. Follow-up on blood pressure"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    className="pc-input w-full px-4 py-2.5"
                  />
                </div>

                {bookingError && (
                  <p className="rounded-2xl border border-[#F2B8B5] bg-[#FEE4E2] px-4 py-2.5 text-[11px] font-medium text-[var(--pc-danger-text)]">
                    {bookingError}
                  </p>
                )}

                <div className="pt-4 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="pc-btn-ghost px-4 py-2.5 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isBooking}
                    className="pc-btn-primary px-5 py-2.5 disabled:opacity-60 cursor-pointer font-semibold"
                  >
                    {isBooking ? 'Booking…' : 'Confirm Booking'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
