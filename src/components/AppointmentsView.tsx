import React, { useState } from 'react';
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
  const [selectedDate, setSelectedDate] = useState<number>(24);
  const [selectedService, setSelectedService] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // New appointment form state
  const [newPatient, setNewPatient] = useState('');
  const [newDoctor, setNewDoctor] = useState('Dr. Sarah Jenkins');
  const [newService, setNewService] = useState<ServiceType>('General Consultation');
  const [newTime, setNewTime] = useState('02:00 PM');
  const [newDemographic] = useState<DemographicType>('Standard');

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

  const handleCreateAppointmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newApt: Appointment = {
      id: `apt-${Date.now()}`,
      tokenCode: `A-${Math.floor(200 + Math.random() * 700)}`,
      patientName: newPatient.trim() || 'New Patient',
      time: newTime,
      date: `2023-10-${selectedDate}`,
      service: newService,
      doctor: newDoctor,
      demographic: newDemographic,
      priority: newDemographic !== 'Standard' ? 'Priority' : 'Normal',
      status: 'Scheduled',
      estWaitMin: 15,
      notes: 'Scheduled via hospital desk intake',
    };

    onAddAppointment(newApt);
    setShowAddModal(false);
    setNewPatient('');
  };

  return (
    <div className="space-y-6 pb-12 text-white">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white font-display">Appointments & Doctor Schedules</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#8e7dff]/20 text-[#8e7dff] border border-[#8e7dff]/30 backdrop-blur-md">
              142 Today
            </span>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Pre-booked clinical consultations synchronized with real-time arrival kiosks and room allocations.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-purple-600 hover:opacity-90 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#8e7dff]/30 active:scale-95 transition-all self-start sm:self-auto cursor-pointer border border-white/20"
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
              <span className="font-bold text-sm text-white font-display">October 2023</span>
              <div className="flex items-center gap-1">
                <button className="p-1.5 text-white/50 hover:text-white rounded-xl hover:bg-white/[0.08] transition-colors cursor-pointer">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="p-1.5 text-white/50 hover:text-white rounded-xl hover:bg-white/[0.08] transition-colors cursor-pointer">
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
              {[...Array(31)].map((_, index) => {
                const day = index + 1;
                const isSelected = selectedDate === day;
                const isToday = day === 24;

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(day)}
                    className={`py-2 rounded-xl font-medium transition-all relative cursor-pointer ${
                      isSelected
                        ? 'bg-[#8e7dff] text-white font-bold shadow-md shadow-[#8e7dff]/40'
                        : isToday
                        ? 'bg-[#8e7dff]/20 text-[#8e7dff] font-bold border border-[#8e7dff]/40'
                        : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <span>{day}</span>
                    {day === 24 && !isSelected && (
                      <span className="w-1 h-1 rounded-full bg-[#8e7dff] mx-auto block mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Copilot Insights Card */}
          <div className="p-6 rounded-3xl glass-panel-elevated bg-[#12122b]/95 border border-white/[0.18] shadow-2xl space-y-3 backdrop-blur-2xl">
            <div className="flex items-center gap-2 text-[#8e7dff]">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">AI Schedule Intelligence</span>
            </div>
            <p className="text-xs text-white/80 leading-relaxed">
              <strong className="text-white">92% on-time consultation rate today.</strong> Dr. Sarah Jenkins is running ~4 mins ahead of schedule, absorbing overflow from pediatric walk-ins.
            </p>
            <button
              onClick={() => onOpenCopilot('Analyze today\'s doctor schedules and identify potential delay risks')}
              className="text-xs font-semibold text-[#8e7dff] hover:text-purple-300 flex items-center gap-1 pt-1 cursor-pointer transition-colors"
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
              <div className="text-2xl font-light text-[#8e7dff] font-display mt-0.5">{checkedInCount}</div>
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
                      'Checked In': 'bg-[#8e7dff]/20 text-[#8e7dff] border-[#8e7dff]/30',
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
                            <span className="font-bold text-[#8e7dff] font-mono">{apt.tokenCode}</span>
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
                                className="px-3 py-1.5 rounded-xl bg-[#8e7dff]/20 hover:bg-[#8e7dff]/30 text-[#8e7dff] font-bold text-[11px] border border-[#8e7dff]/40 transition-colors cursor-pointer"
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
                    value={newService}
                    onChange={(e) => setNewService(e.target.value as ServiceType)}
                    className="w-full px-4 py-2.5 glass-input rounded-2xl text-white font-medium bg-[#12122b]"
                  >
                    <option value="General Consultation" className="bg-[#12122b] text-white">General Consultation</option>
                    <option value="Pediatrics" className="bg-[#12122b] text-white">Pediatrics</option>
                    <option value="Specialist Appointments" className="bg-[#12122b] text-white">Specialist Appointments</option>
                    <option value="Billing & Discharge" className="bg-[#12122b] text-white">Billing</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-white/80 font-bold mb-1.5">Attending Physician</label>
                <select
                  value={newDoctor}
                  onChange={(e) => setNewDoctor(e.target.value)}
                  className="w-full px-4 py-2.5 glass-input rounded-2xl text-white font-medium bg-[#12122b]"
                >
                  <option value="Dr. Sarah Jenkins" className="bg-[#12122b] text-white">Dr. Sarah Jenkins (General OPD)</option>
                  <option value="Dr. Marcus Vance" className="bg-[#12122b] text-white">Dr. Marcus Vance (Pediatrics)</option>
                  <option value="Dr. Robert Zhao" className="bg-[#12122b] text-white">Dr. Robert Zhao (Specialist)</option>
                </select>
              </div>

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
                  className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-purple-600 hover:opacity-90 text-white font-bold shadow-lg shadow-[#8e7dff]/30 cursor-pointer border border-white/20"
                >
                  Confirm Booking
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
