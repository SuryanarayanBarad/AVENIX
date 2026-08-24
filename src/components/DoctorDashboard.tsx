import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { LogOut, Calendar, Clock, User as UserIcon, CheckCircle, XCircle, AlertCircle, Users, Hash, ListOrdered } from 'lucide-react';
import { User, DoctorAppointment, DoctorPatient, DoctorStats } from '../types';
import { doctorApi } from '../services/doctorApi';
import { DenyReasonModal } from './command/DenyReasonModal';

const listEase = [0.22, 1, 0.36, 1] as const;

interface DoctorDashboardProps {
  user: User;
  onLogout: () => void;
}

export const DoctorDashboard: React.FC<DoctorDashboardProps> = ({ user, onLogout }) => {
  const token = localStorage.getItem('auth_token');
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [patientScope, setPatientScope] = useState<'today' | 'upcoming' | 'all'>('today');
  const [stats, setStats] = useState<DoctorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const [denyTarget, setDenyTarget] = useState<DoctorAppointment | null>(null);
  const [denyError, setDenyError] = useState<string | null>(null);
  const [isDenying, setIsDenying] = useState(false);

  // Every one of these calls is scoped server-side to the signed-in doctor —
  // no doctorId is sent from the browser, so another doctor's data is
  // unreachable even by editing the request.
  const fetchDashboardData = async (scope: 'today' | 'upcoming' | 'all' = patientScope) => {
    try {
      setLoading(true);
      setError(null);
      const [appointmentsData, statsData, patientsData] = await Promise.all([
        doctorApi.getAppointments(),
        doctorApi.getStats(),
        doctorApi.getPatients(scope),
      ]);

      setAppointments(appointmentsData);
      setStats(statsData);
      setPatients(patientsData.patients);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboardData(patientScope);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, patientScope]);

  const updateStatus = async (
    appointmentId: string,
    status: string,
    denial?: { reasonId: string; reasonNote?: string },
  ) => {
    // Declining must state a reason; the picker collects it first.
    if (status === 'Denied' && !denial) {
      const target = appointments.find(a => a.id === appointmentId) ?? null;
      setDenyError(null);
      setDenyTarget(target);
      return;
    }

    if (denial) setIsDenying(true);
    try {
      const target = appointments.find(a => a.id === appointmentId);
      await doctorApi.updateAppointmentStatus(appointmentId, status, target?.version, denial);
      setDenyTarget(null);
      await fetchDashboardData();
    } catch (err: any) {
      if (denial) setDenyError(err.message || 'That appointment could not be declined.');
      else setError(err.message || 'That change could not be applied.');
    } finally {
      setIsDenying(false);
    }
  };

  return (
    <div className="min-h-full text-white">
      <header className="bg-white/[0.05] backdrop-blur-2xl border-b border-white/[0.12] p-4 sm:p-5 sticky top-0 z-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-[#8e7dff] via-indigo-500 to-[#ff7db8] flex items-center justify-center text-white shadow-lg shadow-[#8e7dff]/25 border border-white/20">
              <UserIcon className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-white">Doctor Dashboard</h1>
              <p className="text-sm text-white/55">Welcome, {user?.name}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.14] text-white/80 hover:text-white backdrop-blur-md transition-colors cursor-pointer self-start sm:self-auto"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 flex items-center gap-3 backdrop-blur-xl">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Stats Section */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4 rounded-3xl">
              <p className="text-sm text-white/55 mb-1">Today's Total</p>
              <p className="text-2xl font-bold text-white">{stats.totalToday}</p>
            </div>
            <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/25 backdrop-blur-xl shadow-[0_8px_30px_rgba(245,158,11,0.10)]">
              <p className="text-sm text-amber-400/80 mb-1">Pending Requests</p>
              <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
            </div>
            <div className="p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/25 backdrop-blur-xl shadow-[0_8px_30px_rgba(16,185,129,0.10)]">
              <p className="text-sm text-emerald-400/80 mb-1">Approved/Waiting</p>
              <p className="text-2xl font-bold text-emerald-400">{stats.approved}</p>
            </div>
            <div className="p-4 rounded-3xl bg-[#8e7dff]/12 border border-[#8e7dff]/30 backdrop-blur-xl shadow-[0_8px_30px_rgba(142,125,255,0.15)]">
              <p className="text-sm text-[#c5beff]/80 mb-1">Completed</p>
              <p className="text-2xl font-bold text-[#c5beff]">{stats.completed}</p>
            </div>
          </div>
        )}

        {/* All-time statistics — this doctor only */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4 rounded-3xl">
              <p className="text-sm text-white/55 mb-1">Total Appointments</p>
              <p className="text-2xl font-bold text-white">{stats.totalAppointments ?? 0}</p>
            </div>
            <div className="glass-panel p-4 rounded-3xl">
              <p className="text-sm text-white/55 mb-1">Approval Rate</p>
              <p className="text-2xl font-bold text-emerald-400">{stats.approvalRate ?? 0}%</p>
              <p className="text-xs text-white/40 mt-1">
                {stats.approvedTotal ?? 0} approved / {stats.deniedTotal ?? 0} denied
              </p>
            </div>
            <div className="glass-panel p-4 rounded-3xl">
              <p className="text-sm text-white/55 mb-1">Completed Checkups</p>
              <p className="text-2xl font-bold text-[#c5beff]">{stats.completedCheckups ?? 0}</p>
            </div>
            <div className="glass-panel p-4 rounded-3xl">
              <p className="text-sm text-white/55 mb-1">Pending (All Time)</p>
              <p className="text-2xl font-bold text-amber-400">{stats.pendingTotal ?? 0}</p>
            </div>
          </div>
        )}

        {/* My Patients — only patients assigned to this doctor */}
        <div className="glass-panel-elevated rounded-3xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-white/[0.08] flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Users size={18} className="text-[#c5beff]" />
              My Patients
            </h2>
            <div className="flex bg-white/[0.06] p-1 rounded-xl border border-white/[0.12] gap-1">
              {(['today', 'upcoming', 'all'] as const).map(scope => (
                <button
                  key={scope}
                  onClick={() => setPatientScope(scope)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                    patientScope === scope ? 'bg-[#8e7dff]/20 text-[#d6d2ff]' : 'text-white/55 hover:text-white/80'
                  }`}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={`${patientScope}-${loading}`}
            className="divide-y divide-white/[0.06]"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: listEase }}
          >
            {loading ? (
              <div className="p-8 text-center text-white/55">Loading patients...</div>
            ) : patients.length === 0 ? (
              <div className="p-8 text-center text-white/55">No patients assigned to you for this period.</div>
            ) : (
              patients.map(patient => (
                <div key={patient.id} className="p-4 hover:bg-white/[0.03] transition-colors flex flex-col md:flex-row gap-3 md:items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{patient.patientName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        patient.checkupStatus === 'Completed' ? 'bg-[#8e7dff]/20 text-[#d6d2ff]' :
                        patient.checkupStatus === 'In Consultation' ? 'bg-emerald-500/20 text-emerald-300' :
                        patient.checkupStatus === 'Waiting' ? 'bg-amber-500/20 text-amber-300' :
                        patient.checkupStatus === 'Denied' ? 'bg-rose-500/20 text-rose-300' :
                        'bg-white/10 text-white/70'
                      }`}>
                        {patient.checkupStatus}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-white/55">
                      <span className="flex items-center gap-1"><Calendar size={14} /> {patient.date}</span>
                      <span className="flex items-center gap-1"><Clock size={14} /> {patient.displayTime}</span>
                      <span className="flex items-center gap-1">
                        <Hash size={14} /> <span className="font-mono text-white/75">{patient.tokenCode}</span>
                      </span>
                      {patient.queuePosition !== null && (
                        <span className="flex items-center gap-1">
                          <ListOrdered size={14} /> Queue #{patient.queuePosition}
                        </span>
                      )}
                      <span className="text-white/40">{patient.phoneMasked}</span>
                    </div>
                    <p className="text-sm text-white/75">
                      <span className="text-white/40">Reason:</span> {patient.reasonForVisit}
                    </p>
                  </div>
                  <div className="text-sm text-white/55 shrink-0">
                    Appointment status: <span className="text-white/80">{patient.status}</span>
                  </div>
                </div>
              ))
            )}
          </motion.div>
          </AnimatePresence>
        </div>

        {/* Appointments List */}
        <div className="glass-panel-elevated rounded-3xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-white/[0.08] flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Your Appointments</h2>
            <button onClick={() => fetchDashboardData()} className="text-sm text-[#c5beff] hover:text-[#d6d2ff]">
              Refresh
            </button>
          </div>
          
          <div className="divide-y divide-white/[0.06]">
            {loading ? (
              <div className="p-8 text-center text-white/55">Loading appointments...</div>
            ) : appointments.length === 0 ? (
              <div className="p-8 text-center text-white/55">No appointments found for today.</div>
            ) : (
              appointments.map(apt => (
                <div key={apt.id} className="p-4 hover:bg-white/[0.03] transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-lg">{apt.patientName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        apt.status === 'Pending' ? 'bg-amber-500/20 text-amber-300' :
                        apt.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-300' :
                        apt.status === 'Completed' ? 'bg-[#8e7dff]/20 text-[#d6d2ff]' :
                        apt.status === 'Denied' ? 'bg-rose-500/20 text-rose-300' :
                        'bg-white/10 text-white/70'
                      }`}>
                        {apt.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-white/55">
                      <span className="flex items-center gap-1"><Calendar size={14} /> {apt.date}</span>
                      <span className="flex items-center gap-1"><Clock size={14} /> {apt.time}</span>
                      <span className="text-white/40">|</span>
                      <span>Token: <span className="font-mono text-white/75">{apt.code}</span></span>
                    </div>
                    <p className="text-sm text-white/75 mt-2">
                      <span className="text-white/40">Reason:</span> {apt.reasonForVisit}
                    </p>
                    {apt.status === 'Denied' && (apt as any).statusReason && (
                      <p className="text-sm text-rose-300/90 mt-1">
                        <span className="text-white/40">Declined because:</span> {(apt as any).statusReason}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    {apt.status === 'Pending' && (
                      <>
                        <button 
                          onClick={() => updateStatus(apt.id, 'Approved')}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-2xl transition-colors border border-emerald-500/30 cursor-pointer"
                        >
                          <CheckCircle size={16} />
                          Approve
                        </button>
                        <button 
                          onClick={() => updateStatus(apt.id, 'Denied')}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded-2xl transition-colors border border-rose-500/30 cursor-pointer"
                        >
                          <XCircle size={16} />
                          Deny
                        </button>
                      </>
                    )}
                    {apt.status === 'Approved' && (
                      <button 
                        onClick={() => updateStatus(apt.id, 'Completed')}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#8e7dff]/15 hover:bg-[#8e7dff]/25 text-[#c5beff] rounded-2xl transition-colors border border-[#8e7dff]/30 cursor-pointer"
                      >
                        <CheckCircle size={16} />
                        Mark Completed
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <DenyReasonModal
        isOpen={!!denyTarget}
        patientName={denyTarget?.patientName}
        appointmentCode={denyTarget?.code}
        isSubmitting={isDenying}
        error={denyError}
        onCancel={() => { setDenyTarget(null); setDenyError(null); }}
        onConfirm={(reasonId, reasonNote) => {
          if (denyTarget) updateStatus(denyTarget.id, 'Denied', { reasonId, reasonNote });
        }}
      />
    </div>
  );
};
