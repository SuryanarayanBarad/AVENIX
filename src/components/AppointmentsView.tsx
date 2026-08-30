import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { 
  Search, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  PhoneCall
} from 'lucide-react';
import { Appointment, ServiceType, DemographicType } from '../types';
import { visitorApi } from '../services/queueApi';
import type { DoctorOption, SpecializationOption } from './AppointmentFlow';

const modalEase = [0.22, 1, 0.36, 1] as const;

interface AppointmentsViewProps {
  appointments: Appointment[];
  onUpdateAppointment: (appointment: Appointment) => void;
  onAddAppointment: (appointment: Appointment) => void;
  onOpenCopilot: (prompt?: string) => void;
}

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({
  appointments,
  onUpdateAppointment,
  onAddAppointment,
  onOpenCopilot,
}) => {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<number>(today.getDate());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [selectedService, setSelectedService] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // New appointment form state
  const [newPatient, setNewPatient] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [newDoctorId, setNewDoctorId] = useState('');
  const [newSpecialization, setNewSpecialization] = useState<string>('All');
  const [newReason, setNewReason] = useState('');
  const [newTime, setNewTime] = useState('02:00 PM');
  const [newDemographic] = useState<DemographicType>('Standard');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // The physician and specialty lists are the facility's real records, loaded
  // when the modal opens so a doctor assigned moments ago is bookable here too.
  const [directory, setDirectory] = useState<DoctorOption[]>([]);
  const [specializations, setSpecializations] = useState<SpecializationOption[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  useEffect(() => {
    if (!showAddModal) return;
    let mounted = true;
    setIsLoadingDirectory(true);
    Promise.all([
      visitorApi.getDoctorDirectory(),
      visitorApi.getSpecializations().catch(() => []),
    ])
      .then(([docs, specs]) => {
        if (!mounted) return;
        setDirectory(docs as DoctorOption[]);
        setSpecializations(specs);
      })
      .catch(() => {
        if (mounted) setBookingError('The doctor list could not be loaded.');
      })
      .finally(() => {
        if (mounted) setIsLoadingDirectory(false);
      });
    return () => { mounted = false; };
  }, [showAddModal]);

  /** Physicians matching the chosen specialty; "All" shows every doctor. */
  const selectableDoctors = newSpecialization === 'All'
    ? directory
    : directory.filter((doc) => (doc.specialization ?? doc.department) === newSpecialization);

  // Never leave a physician selected who is filtered out of view.
  useEffect(() => {
    if (newDoctorId && !selectableDoctors.some((doc) => doc.id === newDoctorId)) {
      setNewDoctorId('');
    }
  }, [selectableDoctors, newDoctorId]);

  const filteredAppointments = appointments.filter((apt) => {
    const matchesSearch = apt.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          apt.tokenCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          apt.doctor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesService = selectedService === 'All' || apt.service === selectedService;
    return matchesSearch && matchesService;
  });

  const checkedInCount = appointments.filter(a => a.status === 'Checked In' || a.status === 'Waiting' || a.status === 'In Consultation').length;

  const handleCallPatient = (apt: Appointment) => {
    onUpdateAppointment({
      ...apt,
      status: 'In Consultation',
      estWaitMin: 0,
    });
  };

  const handleCheckIn = (apt: Appointment) => {
    onUpdateAppointment({
      ...apt,
      status: 'Checked In',
      estWaitMin: 12,
    });
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
   * Book a real appointment.
   *
   * This used to fabricate an id and a random token code and drop the result
   * into local state, so nothing was ever persisted and the booking vanished on
   * refresh. It now goes through the same booking service the patient flow
   * uses, which means slot-conflict protection, a real token code, and the
   * doctor's approval step all apply.
   */
  const handleCreateAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBooking) return;

    // Desk booking: a patient with no mobile can still be booked in. Staff hand
    // over the printed appointment code instead. A number that IS given must
    // still be valid, so a typo is not silently accepted as "no contact".
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

    const date = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;

    setIsBooking(true);
    setBookingError(null);
    try {
      const created = await visitorApi.createAppointment({
        doctorId: doctor.id,
        date,
        time: newTime,
        patientName: newPatient.trim() || 'New Patient',
        phone: cleanPhone || undefined,
        reasonForVisit: newReason.trim() || 'Booked at the front desk',
      } as any);

      // Mirror the saved appointment into the on-screen list straight away.
      onAddAppointment({
        id: created.id,
        tokenCode: created.appointmentId ?? created.id,
        patientName: newPatient.trim() || 'New Patient',
        time: newTime,
        date,
        service: (doctor.specialization ?? doctor.department) as ServiceType,
        doctor: doctor.name,
        demographic: newDemographic,
        priority: newDemographic !== 'Standard' ? 'Priority' : 'Normal',
        status: 'Scheduled',
        estWaitMin: 15,
        notes: `Phone: ${newPhone}`,
      });

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
    <div className="space-y-6 pb-12 text-white">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white font-display">Appointments & Doctor Schedules</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#2E37A4]/20 text-[#2E37A4] border border-[#2E37A4]/30 backdrop-blur-md">
              142 Today
            </span>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Pre-booked clinical consultations synchronized with real-time arrival kiosks and room allocations.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 rounded-2xl bg-[var(--pc-primary)] hover:opacity-90 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#2E37A4]/30 active:scale-95 transition-all self-start sm:self-auto cursor-pointer border border-white/20"
        >
          <Plus className="w-4 h-4" />
          <span>Book Appointment</span>
        </button>
      </div>

      {/* Grid: Left Mini Calendar & AI Card (4 cols) | Right Appointment Table (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Calendar & Insights */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Calendar Widget (Frosted Glass Panel) */}
          <div className="glass-panel-elevated rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative">
                <button 
                  onClick={() => setShowMonthSelector(!showMonthSelector)}
                  className="font-bold text-sm text-white font-display flex items-center gap-1 hover:text-white/80 cursor-pointer"
                >
                  {new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
                </button>
                {showMonthSelector && (
                  <div className="absolute top-full left-0 mt-2 w-52 p-3 rounded-2xl bg-[#12122b] border border-white/[0.25] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] z-50">
                    <div className="flex items-center justify-between mb-3 px-1">
                       <button onClick={() => {
                         if (currentYear > today.getFullYear()) setCurrentYear(currentYear - 1);
                       }} disabled={currentYear <= today.getFullYear()} className={`p-1 rounded-md ${currentYear <= today.getFullYear() ? 'text-white/20 cursor-not-allowed' : 'text-white/70 hover:bg-white/[0.1] hover:text-white cursor-pointer'}`}>
                         <ChevronLeft className="w-4 h-4" />
                       </button>
                       <span className="text-xs font-bold text-white">{currentYear}</span>
                       <button onClick={() => setCurrentYear(currentYear + 1)} className="p-1 text-white/70 hover:bg-white/[0.1] hover:text-white rounded-md cursor-pointer">
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
                            onClick={() => {
                              setCurrentMonth(i);
                              setShowMonthSelector(false);
                            }}
                            className={`text-xs py-1.5 rounded-lg font-medium ${isDisabled ? 'text-white/20 cursor-not-allowed' : currentMonth === i ? 'liquid-glass-active font-semibold' : 'text-white/70 hover:bg-white/[0.08] hover:text-white cursor-pointer'}`}
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
                  className={`p-1.5 rounded-xl transition-colors ${currentYear === today.getFullYear() && currentMonth === today.getMonth() ? 'text-white/20 cursor-not-allowed' : 'text-white/50 hover:text-white hover:bg-white/[0.08] cursor-pointer'}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={handleNextMonth} className="p-1.5 text-white/50 hover:text-white rounded-xl hover:bg-white/[0.08] transition-colors cursor-pointer">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Days of week */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-white/40 uppercase">
              <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>

            {/* Dates Grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {[...Array(new Date(currentYear, currentMonth + 1, 0).getDate())].map((_, index) => {
                const day = index + 1;
                const isSelected = selectedDate === day;
                const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(day)}
                    className={`py-2 rounded-xl font-medium transition-all relative cursor-pointer ${
                      isSelected
                        ? 'liquid-glass-active font-semibold'
                        : isToday
                        ? 'bg-[#2E37A4]/20 text-[#2E37A4] font-bold border border-[#2E37A4]/40'
                        : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <span>{day}</span>
                    {isToday && !isSelected && (
                      <span className="w-1 h-1 rounded-full bg-[#2E37A4] mx-auto block mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Copilot Insights Card */}
          <div className="p-6 rounded-3xl glass-panel-elevated bg-[#12122b]/95 border border-white/[0.18] shadow-2xl space-y-3 backdrop-blur-2xl">
            <div className="flex items-center gap-2 text-[#2E37A4]">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">AI Schedule Intelligence</span>
            </div>
            <p className="text-xs text-white/80 leading-relaxed">
              <strong className="text-white">92% on-time consultation rate today.</strong> Dr. Sarah Jenkins is running ~4 mins ahead of schedule, absorbing overflow from pediatric walk-ins.
            </p>
            <button
              onClick={() => onOpenCopilot('Analyze today\'s doctor schedules and identify potential delay risks')}
              className="text-xs font-semibold text-[#2E37A4] hover:text-[var(--pc-primary)] flex items-center gap-1 pt-1 cursor-pointer transition-colors"
            >
              <span>Ask Schedule Copilot</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Right Column: Appointment KPIs & Table */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* 3 Quick KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-5 rounded-3xl glass-panel-elevated">
              <span className="text-xs text-white/50 font-medium">Total Bookings Today</span>
              <div className="text-2xl font-light text-white font-display mt-0.5">142</div>
            </div>
            <div className="p-5 rounded-3xl glass-panel-elevated">
              <span className="text-xs text-white/50 font-medium">Checked In / Waiting</span>
              <div className="text-2xl font-light text-[#2E37A4] font-display mt-0.5">{checkedInCount}</div>
            </div>
            <div className="p-5 rounded-3xl glass-panel-elevated">
              <span className="text-xs text-white/50 font-medium">Avg Consultation Wait</span>
              <div className="text-2xl font-light text-emerald-400 font-display mt-0.5">~11m</div>
            </div>
          </div>

          {/* Filter Bar (Frosted Glass Panel) */}
          <div className="p-4 glass-panel-elevated rounded-3xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search patient, doctor, or token..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 glass-input rounded-2xl placeholder-white/40 text-white text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="px-3.5 py-2 glass-input rounded-2xl font-medium text-white/80 bg-[#12122b] cursor-pointer"
              >
                <option value="All" className="bg-[#12122b] text-white">All Specialties</option>
                <option value="General Consultation" className="bg-[#12122b] text-white">General Consultation</option>
                <option value="Pediatrics" className="bg-[#12122b] text-white">Pediatrics</option>
                <option value="Specialist Appointments" className="bg-[#12122b] text-white">Specialist</option>
                <option value="Billing & Discharge" className="bg-[#12122b] text-white">Billing</option>
              </select>
            </div>
          </div>

          {/* Appointments Table (Frosted Glass Table) */}
          <div className="glass-panel-elevated rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-white/[0.04] border-b border-white/[0.10] text-white/50 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-5">Time</th>
                    <th className="py-3.5 px-5">Token & Patient</th>
                    <th className="py-3.5 px-5">Service & Doctor</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredAppointments.map((apt) => {
                    const statusColors = {
                      'In Consultation': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold shadow-[0_0_8px_rgba(74,222,128,0.4)]',
                      'Waiting': 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-semibold',
                      'Checked In': 'bg-[#2E37A4]/20 text-[#2E37A4] border-[#2E37A4]/30',
                      'Scheduled': 'bg-white/[0.06] text-white/70 border-white/[0.10]',
                      'Completed': 'bg-white/[0.04] text-white/40 border-white/[0.06] line-through',
                      'Delayed': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
                    };

                    return (
                      <tr key={apt.id} className="hover:bg-white/[0.04] transition-colors">
                        
                        {/* Time */}
                        <td className="py-4 px-5 font-bold text-white font-mono">
                          {apt.time}
                        </td>

                        {/* Token & Patient */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#2E37A4] font-mono">{apt.tokenCode}</span>
                            <span className="font-semibold text-white">{apt.patientName}</span>
                          </div>
                          {apt.demographic !== 'Standard' && (
                            <span className="text-[10px] text-amber-300 font-medium block mt-0.5">
                              ★ {apt.demographic} Priority
                            </span>
                          )}
                        </td>

                        {/* Service & Doctor */}
                        <td className="py-4 px-5">
                          <span className="font-medium text-white block">{apt.doctor}</span>
                          <span className="text-[10px] text-white/50">{apt.service}</span>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] border backdrop-blur-md ${statusColors[apt.status]}`}>
                            {apt.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {apt.status === 'Scheduled' && (
                              <button
                                onClick={() => handleCheckIn(apt)}
                                className="px-3 py-1.5 rounded-xl bg-[#2E37A4]/20 hover:bg-[#2E37A4]/30 text-[#2E37A4] font-bold text-[11px] border border-[#2E37A4]/40 transition-colors cursor-pointer"
                              >
                                Check In
                              </button>
                            )}

                            {apt.status === 'Checked In' && (
                              <button
                                onClick={() => handleCallPatient(apt)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] border border-emerald-500/40 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <PhoneCall className="w-3 h-3" />
                                <span>Call In</span>
                              </button>
                            )}
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

      {/* Add Appointment Modal (Frosted Glass Modal) */}
      <AnimatePresence initial={false}>
        {showAddModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: modalEase }}
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              className="w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.20] bg-[#12122b]/95 text-white shadow-2xl glass-panel-elevated backdrop-blur-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Book clinical appointment"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
              onClick={(event) => event.stopPropagation()}
            >
            <div className="p-6 bg-white/[0.04] border-b border-white/[0.10] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg font-display text-white">Book Clinical Appointment</h3>
                <p className="text-xs text-white/60">Schedule patient consultation with designated physician</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-white/50 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAppointmentSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-white/80 font-bold mb-1.5">Patient Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikram Patel"
                  value={newPatient}
                  onChange={(e) => setNewPatient(e.target.value)}
                  className="w-full px-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white"
                />
              </div>

              <div>
                <label className="block text-white/80 font-bold mb-1.5">Phone Number <span className="font-normal text-white/45">(optional)</span></label>
                <input
                  type="tel"
                  placeholder="Optional — leave blank if the patient has no phone"
                  value={newPhone}
                  onChange={(e) => {
                    setNewPhone(e.target.value);
                    if (phoneError) setPhoneError('');
                  }}
                  className={`w-full px-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white ${phoneError ? 'border-red-500/50 focus:border-red-500' : ''}`}
                />
                {phoneError && (
                  <p className="text-red-400 mt-1.5 text-[10px] font-medium">{phoneError}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/80 font-bold mb-1.5">Time Slot</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 02:30 PM"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full px-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white"
                  />
                </div>
                <div>
                  <label className="block text-white/80 font-bold mb-1.5">Specialty Service</label>
                  <select
                    value={newSpecialization}
                    onChange={(e) => setNewSpecialization(e.target.value)}
                    className="w-full px-4 py-2.5 glass-input rounded-2xl text-white font-medium bg-[#12122b]"
                  >
                    {/* Every specialization the facility has, All first. */}
                    <option value="All" className="bg-[#12122b] text-white">
                      All specializations ({directory.length})
                    </option>
                    {specializations.map((spec) => (
                      <option
                        key={spec.id}
                        value={spec.name}
                        disabled={spec.doctorCount === 0}
                        className="bg-[#12122b] text-white"
                      >
                        {spec.name} ({spec.doctorCount})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-white/80 font-bold mb-1.5">Attending Physician</label>
                <select
                  required
                  value={newDoctorId}
                  onChange={(e) => setNewDoctorId(e.target.value)}
                  disabled={isLoadingDirectory || selectableDoctors.length === 0}
                  className="w-full px-4 py-2.5 glass-input rounded-2xl text-white font-medium bg-[#12122b] disabled:opacity-60"
                >
                  <option value="" className="bg-[#12122b] text-white">
                    {isLoadingDirectory
                      ? 'Loading physicians…'
                      : selectableDoctors.length === 0
                        ? 'No physician assigned to this specialty'
                        : 'Select a physician…'}
                  </option>
                  {selectableDoctors.map((doc) => (
                    <option key={doc.id} value={doc.id} className="bg-[#12122b] text-white">
                      {doc.name} ({doc.specialization ?? doc.department})
                      {doc.status && doc.status !== 'Available' ? ` — ${doc.status}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white/80 font-bold mb-1.5">Reason for Visit</label>
                <input
                  type="text"
                  placeholder="e.g. Follow-up on blood pressure"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full px-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white"
                />
              </div>

              {bookingError && (
                <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-[11px] font-medium text-red-300">
                  {bookingError}
                </p>
              )}

              <div className="pt-4 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-white/80 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBooking}
                  className="px-5 py-2.5 rounded-2xl bg-[var(--pc-primary)] hover:opacity-90 disabled:opacity-60 text-white font-bold shadow-lg shadow-[#2E37A4]/30 cursor-pointer border border-white/20"
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
