import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { 
  Plus, 
  Search, 
  PhoneCall, 
  FastForward, 
  UserCheck
} from 'lucide-react';
import { Token, ServiceType, PriorityLevel, Counter } from '../types';

const modalEase = [0.22, 1, 0.36, 1] as const;

interface LiveQueueViewProps {
  tokens: Token[];
  counters: Counter[];
  onUpdateToken: (token: Token) => void;
  onAddToken: (token: Token) => void;
}

export const LiveQueueView: React.FC<LiveQueueViewProps> = ({
  tokens,
  onUpdateToken,
  onAddToken,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedService, setSelectedService] = useState<string>('All');
  const [selectedPriority, setSelectedPriority] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // New manual token state
  const [newPatientName, setNewPatientName] = useState('');
  const [newService, setNewService] = useState<ServiceType>('General Consultation');
  const [newPriority, setNewPriority] = useState<PriorityLevel>('Normal');

  const filteredTokens = tokens.filter((t) => {
    const matchesSearch = t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.patientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesService = selectedService === 'All' || t.service === selectedService;
    const matchesPriority = selectedPriority === 'All' || t.priority === selectedPriority;
    const matchesStatus = selectedStatus === 'All' || t.status === selectedStatus;
    return matchesSearch && matchesService && matchesPriority && matchesStatus;
  });

  const waitingCount = tokens.filter(t => t.status === 'waiting' || t.status === 'approaching').length;
  const servingCount = tokens.filter(t => t.status === 'serving').length;
  const completedCount = tokens.filter(t => t.status === 'completed').length;
  const avgWait = Math.round(tokens.reduce((acc, t) => acc + t.estWaitMin, 0) / (tokens.length || 1));

  const handleCallPatient = (token: Token) => {
    onUpdateToken({
      ...token,
      status: 'serving',
      estWaitMin: 0,
      peopleAhead: 0,
    });
  };

  const handleMarkCompleted = (token: Token) => {
    onUpdateToken({
      ...token,
      status: 'completed',
    });
  };

  const handleExpedite = (token: Token) => {
    onUpdateToken({
      ...token,
      priority: 'Priority',
      fairnessAdjustment: token.fairnessAdjustment + 3,
      estWaitMin: Math.max(1, Math.floor(token.estWaitMin / 2)),
      peopleAhead: Math.max(0, token.peopleAhead - 2),
    });
  };

  const handleCreateTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const codeNum = Math.floor(200 + Math.random() * 799);
    let prefix = 'A';
    if (newService === 'Pediatrics') prefix = 'P';
    if (newService === 'Pharmacy & Dispensing') prefix = 'RX';
    if (newService === 'Billing & Discharge') prefix = 'B';
    if (newService === 'Emergency Triage') prefix = 'E';

    const newToken: Token = {
      id: `t-${Date.now()}`,
      code: `${prefix}-${codeNum}`,
      service: newService,
      priority: newPriority,
      demographic: newPriority === 'Emergency' ? 'Emergency' : (newPriority === 'Priority' ? 'Elderly' : 'Standard'),
      patientName: newPatientName.trim() || `Visitor ${prefix}-${codeNum}`,
      issueTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      estWaitMin: newPriority === 'Emergency' ? 0 : 12,
      peopleAhead: newPriority === 'Emergency' ? 0 : 3,
      counterId: 'Counter 01',
      status: newPriority === 'Emergency' ? 'serving' : 'waiting',
      urgencyScore: newPriority === 'Emergency' ? 99 : 70,
      fairnessAdjustment: newPriority === 'Emergency' ? 10 : 0,
      checkInMethod: 'Desk Triage',
    };

    onAddToken(newToken);
    setShowAddModal(false);
    setNewPatientName('');
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Live Queue Monitoring</h1>
          <p className="text-xs text-white/60 mt-1">
            Real-time patient tokens, priority classification, and wait SLA tracking.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 rounded-2xl bg-[var(--pc-primary)] hover:from-[#3538CD] hover:to-[#3538CD] text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#2E37A4]/30 active:scale-95 transition-all self-start sm:self-auto cursor-pointer border border-white/20"
        >
          <Plus className="w-4 h-4" />
          <span>Manual Token Intake</span>
        </button>
      </div>

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        <div className="p-5 rounded-3xl liquid-glass">
          <span className="text-xs font-semibold text-white/60">Total Visitors Today</span>
          <div className="text-2xl font-light text-white font-display mt-1">
            {tokens.length + 138}
          </div>
          <span className="text-[10px] text-emerald-400 font-medium">99.2% intake completed</span>
        </div>

        <div className="p-5 rounded-3xl liquid-glass">
          <span className="text-xs font-semibold text-white/60">Currently Waiting</span>
          <div className="text-2xl font-light text-[#2E37A4] font-display mt-1">
            {waitingCount}
          </div>
          <span className="text-[10px] text-white/50 font-medium">{servingCount} actively serving</span>
        </div>

        <div className="p-5 rounded-3xl liquid-glass">
          <span className="text-xs font-semibold text-white/60">Total Served</span>
          <div className="text-2xl font-light text-emerald-400 font-display mt-1">
            {completedCount + 24}
          </div>
          <span className="text-[10px] text-emerald-400 font-medium">+18 served this hour</span>
        </div>

        <div className="p-5 rounded-3xl liquid-glass">
          <span className="text-xs font-semibold text-white/60">Avg Wait Time</span>
          <div className="text-2xl font-light text-white font-display mt-1">
            ~{avgWait} <span className="text-xs font-normal text-white/50">min</span>
          </div>
          <span className="text-[10px] text-[#2E37A4] font-semibold bg-[#2E37A4]/20 px-2 py-0.5 rounded-full border border-[#2E37A4]/30 backdrop-blur-md mt-0.5 inline-block">
            AI forecast: -4 min next hr
          </span>
        </div>

      </div>

      {/* Filter Toolbar (Frosted Glass Panel) */}
      <div className="p-4 liquid-glass rounded-3xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Token (e.g. A-184) or Patient Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 glass-input rounded-2xl placeholder-white/40 text-white text-xs"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="px-3.5 py-2 glass-input rounded-2xl font-medium text-white/80 bg-[#12122b] cursor-pointer"
          >
            <option value="All" className="bg-[#12122b] text-white">All Services</option>
            <option value="General Consultation" className="bg-[#12122b] text-white">General Consultation</option>
            <option value="Pediatrics" className="bg-[#12122b] text-white">Pediatrics</option>
            <option value="Billing & Discharge" className="bg-[#12122b] text-white">Billing & Discharge</option>
            <option value="Pharmacy & Dispensing" className="bg-[#12122b] text-white">Pharmacy & Dispensing</option>
            <option value="Specialist Appointments" className="bg-[#12122b] text-white">Specialist Appointments</option>
            <option value="Emergency Triage" className="bg-[#12122b] text-white">Emergency Triage</option>
          </select>

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-3.5 py-2 glass-input rounded-2xl font-medium text-white/80 bg-[#12122b] cursor-pointer"
          >
            <option value="All" className="bg-[#12122b] text-white">All Priorities</option>
            <option value="Emergency" className="bg-[#12122b] text-white">Emergency</option>
            <option value="Priority" className="bg-[#12122b] text-white">Priority / Fast-Track</option>
            <option value="Normal" className="bg-[#12122b] text-white">Normal</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3.5 py-2 glass-input rounded-2xl font-medium text-white/80 bg-[#12122b] cursor-pointer"
          >
            <option value="All" className="bg-[#12122b] text-white">All Statuses</option>
            <option value="waiting" className="bg-[#12122b] text-white">Waiting</option>
            <option value="approaching" className="bg-[#12122b] text-white">Approaching</option>
            <option value="serving" className="bg-[#12122b] text-white">Serving</option>
            <option value="completed" className="bg-[#12122b] text-white">Completed</option>
          </select>

        </div>

      </div>

      {/* Main Token Table (Frosted Glass Table) */}
      <div className="liquid-glass rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-white/[0.04] border-b border-white/[0.10] text-white/50 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-5">Token ID</th>
                <th className="py-3.5 px-5">Patient / Demographic</th>
                <th className="py-3.5 px-5">Service</th>
                <th className="py-3.5 px-5">Priority Level</th>
                <th className="py-3.5 px-5 text-center">Ahead</th>
                <th className="py-3.5 px-5 text-center">Est. Wait</th>
                <th className="py-3.5 px-5">Assigned Counter</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredTokens.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-white/40">
                    No tokens found matching your active filters.
                  </td>
                </tr>
              ) : (
                filteredTokens.map((token) => {
                  const priorityBadges = {
                    Emergency: 'bg-rose-500/20 text-rose-300 border-rose-500/30 font-bold shadow-[0_0_8px_rgba(244,63,94,0.4)]',
                    Priority: 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-semibold',
                    Normal: 'bg-white/[0.06] text-white/60 border-white/[0.10]',
                  };

                  const statusBadges = {
                    waiting: 'bg-white/[0.06] text-white/70 border-white/[0.10]',
                    approaching: 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse font-semibold',
                    serving: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold shadow-[0_0_8px_rgba(74,222,128,0.4)]',
                    completed: 'bg-white/[0.04] text-white/40 border-white/[0.06] line-through',
                    cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                  };

                  return (
                    <tr key={token.id} className="hover:bg-white/[0.04] transition-colors">
                      
                      {/* Code */}
                      <td className="py-4 px-5 font-bold text-white font-mono text-sm">
                        {token.code}
                      </td>

                      {/* Patient & Demographic */}
                      <td className="py-4 px-5">
                        <span className="font-semibold text-white block">{token.patientName}</span>
                        <div className="flex items-center gap-1.5 text-[10px] text-white/40 mt-0.5">
                          <span>{token.demographic}</span>
                          {token.fairnessAdjustment > 0 && (
                            <span className="text-emerald-400 font-semibold">
                              (+{token.fairnessAdjustment} pos fair boost)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Service */}
                      <td className="py-4 px-5 text-white/80 font-medium">
                        {token.service}
                      </td>

                      {/* Priority */}
                      <td className="py-4 px-5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] border backdrop-blur-md ${priorityBadges[token.priority]}`}>
                          {token.priority}
                        </span>
                      </td>

                      {/* Ahead */}
                      <td className="py-4 px-5 text-center font-bold text-white">
                        {token.peopleAhead}
                      </td>

                      {/* Est Wait */}
                      <td className="py-4 px-5 text-center font-bold text-white">
                        {token.status === 'serving' ? 'Serving' : `~${token.estWaitMin}m`}
                      </td>

                      {/* Counter */}
                      <td className="py-4 px-5 font-bold text-[#2E37A4]">
                        {token.counterId}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] border backdrop-blur-md ${statusBadges[token.status]}`}>
                          {token.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {token.status !== 'serving' && token.status !== 'completed' && (
                            <button
                              onClick={() => handleCallPatient(token)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] border border-emerald-500/40 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Call Patient to Counter"
                            >
                              <PhoneCall className="w-3 h-3" />
                              <span>Call</span>
                            </button>
                          )}

                          {token.status === 'serving' && (
                            <button
                              onClick={() => handleMarkCompleted(token)}
                              className="px-3 py-1.5 rounded-xl bg-[#2E37A4]/20 hover:bg-[#2E37A4]/30 text-[#2E37A4] font-bold text-[11px] border border-[#2E37A4]/40 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Mark Consultation Complete"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Done</span>
                            </button>
                          )}

                          {token.priority === 'Normal' && token.status === 'waiting' && (
                            <button
                              onClick={() => handleExpedite(token)}
                              className="p-1.5 text-white/40 hover:text-amber-300 rounded-xl hover:bg-white/[0.08] transition-colors cursor-pointer"
                              title="Expedite Fairness Priority"
                            >
                              <FastForward className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Token Creation Modal (Frosted Glass Modal) */}
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
              className="w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.20] bg-[#12122b]/95 text-white shadow-2xl liquid-glass backdrop-blur-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Desk triage manual intake"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
              onClick={(event) => event.stopPropagation()}
            >
            <div className="p-6 bg-white/[0.04] border-b border-white/[0.10] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg font-display text-white">Desk Triage Manual Intake</h3>
                <p className="text-xs text-white/60">Issue direct priority token from reception desk</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-white/50 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTokenSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-white/80 font-bold mb-1.5">Patient Full Name / ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Devon Miles or Hospital ID"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  className="w-full px-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white"
                />
              </div>

              <div>
                <label className="block text-white/80 font-bold mb-1.5">Service Department</label>
                <select
                  value={newService}
                  onChange={(e) => setNewService(e.target.value as ServiceType)}
                  className="w-full px-4 py-2.5 glass-input rounded-2xl font-medium text-white bg-[#12122b]"
                >
                  <option value="General Consultation" className="bg-[#12122b] text-white">General Consultation</option>
                  <option value="Pediatrics" className="bg-[#12122b] text-white">Pediatrics</option>
                  <option value="Billing & Discharge" className="bg-[#12122b] text-white">Billing & Discharge</option>
                  <option value="Pharmacy & Dispensing" className="bg-[#12122b] text-white">Pharmacy & Dispensing</option>
                  <option value="Specialist Appointments" className="bg-[#12122b] text-white">Specialist Appointments</option>
                  <option value="Emergency Triage" className="bg-[#12122b] text-white">Emergency Triage</option>
                </select>
              </div>

              <div>
                <label className="block text-white/80 font-bold mb-1.5">Priority Override</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Normal', 'Priority', 'Emergency'] as PriorityLevel[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewPriority(p)}
                      className={`py-2 rounded-2xl border text-center font-bold transition-all cursor-pointer ${
                        newPriority === p
                          ? 'border-[#2E37A4] bg-[#2E37A4]/25 text-white shadow-[0_0_12px_rgba(46,55,164,0.18)]'
                          : 'border-white/[0.10] bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
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
                  className="px-5 py-2.5 rounded-2xl bg-[var(--pc-primary)] hover:opacity-90 text-white font-bold shadow-lg shadow-[#2E37A4]/30 cursor-pointer border border-white/20"
                >
                  Issue Token
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
