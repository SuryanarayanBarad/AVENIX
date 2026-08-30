import React from 'react';
import { 
  Users, 
  Clock, 
  Activity, 
  SlidersHorizontal, 
  Sparkles, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  ChevronRight, 
  Radar, 
  Zap
} from 'lucide-react';
import { Counter, FacilityZone, PredictionPoint, Token } from '../types';

interface AdminOverviewProps {
  counters: Counter[];
  zones: FacilityZone[];
  predictions: PredictionPoint[];
  tokens: Token[];
  onNavigateTab: (tab: any) => void;
  onOpenCopilot: (initialPrompt?: string) => void;
  onApplyRecommendation: () => void;
  recommendationApplied: boolean;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  counters,
  zones,
  predictions,
  tokens,
  onNavigateTab,
  onOpenCopilot,
  onApplyRecommendation,
  recommendationApplied,
}) => {
  const totalWaiting = counters.reduce((sum, c) => sum + c.queueCount, 0);
  const activeCountersCount = counters.filter(c => c.status !== 'Closed').length;

  return (
    <div className="mt-6 space-y-6 pb-12">
      
      {/* Top Greeting & Operational Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white font-display">Hospital Queue Intelligence</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
              Real-time Sync Active
            </span>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Monitoring CityCare Hospital Ground & Triage zones via 42 LiDAR and thermal sensing nodes.
          </p>
        </div>
      </div>

      {/* 4 Hero KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Current Queue */}
        <div className="p-5 rounded-3xl glass-panel-elevated space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Current Queue</span>
            <div className="w-9 h-9 rounded-2xl bg-[#2E37A4]/20 text-[#2E37A4] flex items-center justify-center border border-[#2E37A4]/30 shadow-sm">
              <Users className="w-4.5 h-4.5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-light text-white font-display">
              {totalWaiting} <span className="text-xs font-normal text-white/50">people</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-amber-300 mt-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+8.4% vs last hour</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Average Wait Time */}
        <div className="p-5 rounded-3xl glass-panel-elevated space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Average Wait Time</span>
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/30 shadow-sm">
              <Clock className="w-4.5 h-4.5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-light text-white font-display">
              {recommendationApplied ? '9' : '18'} <span className="text-xs font-normal text-white/50">mins</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-emerald-400 mt-1">
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>{recommendationApplied ? '-50% optimized' : '-12% vs yesterday'}</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Crowd Level */}
        <div className="p-5 rounded-3xl glass-panel-elevated space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Facility Density</span>
            <div className="w-9 h-9 rounded-2xl bg-[#00D3C7]/20 text-[#00D3C7] flex items-center justify-center border border-[#00D3C7]/30 shadow-sm">
              <Activity className="w-4.5 h-4.5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-light text-white font-display">
              64% <span className="text-xs font-normal text-white/50">Moderate</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-[#00D3C7] mt-1">
              <Radar className="w-3.5 h-3.5" />
              <span>1,284 / 2,000 Capacity</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Active Counters */}
        <div className="p-5 rounded-3xl glass-panel-elevated space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Active Counters</span>
            <div className="w-9 h-9 rounded-2xl bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-500/30 shadow-sm">
              <SlidersHorizontal className="w-4.5 h-4.5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-light text-white font-display">
              {activeCountersCount} <span className="text-xs font-normal text-white/50">/ {counters.length} Active</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-emerald-400 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Fairness Score: 94/100</span>
            </div>
          </div>
        </div>

      </div>

      {/* AI Recommendation Banner (Frosted Glass Hero) */}
      <div className={`p-6 rounded-3xl transition-all ${
        recommendationApplied 
          ? 'glass-panel-elevated border border-emerald-500/40 bg-emerald-950/30 text-white'
          : 'glass-hero border border-[#2E37A4]/40 text-white shadow-2xl'
      }`}>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
              recommendationApplied 
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                : 'bg-[#2E37A4]/20 text-[#2E37A4] border-[#2E37A4]/40 shadow-md shadow-[#2E37A4]/20'
            }`}>
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border backdrop-blur-md ${
                  recommendationApplied 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                    : 'bg-[#2E37A4]/20 text-[#2E37A4] border-[#2E37A4]/40'
                }`}>
                  {recommendationApplied ? 'OPTIMIZATION ACTIVE' : 'AI RECOMMENDATION'}
                </span>
                <span className="text-xs text-white/60 font-medium">Predicted Inflow Surge in ~20 mins</span>
              </div>
              <h3 className="text-lg font-bold mt-1 font-display text-white">
                {recommendationApplied
                  ? 'Counter 05 successfully reallocated. Wait times reduced to 9 mins.'
                  : 'Crowd pressure is expected to increase at Counter 01 (General Consultation).'}
              </h3>
              <p className="text-xs mt-1 leading-relaxed max-w-2xl text-white/70">
                {recommendationApplied
                  ? 'Queue throughput increased by +48%. LiDAR sensor density in Main Lounge is stabilizing.'
                  : 'Reassigning Desk Staff Ava at Counter 05 (currently Idle) to General Consultation will drop average wait time from 18 min to 9 min.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center">
            {!recommendationApplied && (
              <button
                onClick={onApplyRecommendation}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#2E37A4] to-purple-600 hover:from-[#3538CD] hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-[#2E37A4]/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 border border-white/20"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Apply Recommendation</span>
              </button>
            )}

            <button
              onClick={() => onOpenCopilot('Explain the mathematical reasoning and sensor basis for reassigning Counter 05')}
              className="px-4 py-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] text-white font-semibold text-xs border border-white/[0.15] transition-all cursor-pointer backdrop-blur-md"
            >
              <span>View Reasoning</span>
            </button>
          </div>

        </div>
      </div>

      {/* Grid: Live Queue Intelligence Table (Left 7 cols) & Arrival Trend + Floorplan (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Live Queue Intelligence Table */}
        <div className="lg:col-span-7 glass-panel-elevated rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white font-display">Live Counter Status</h2>
              <p className="text-xs text-white/60">Real-time status across hospital service counters</p>
            </div>
            <button
              onClick={() => onNavigateTab('live-queue')}
              className="text-xs font-semibold text-[#2E37A4] hover:text-[#a78bfa] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>View Full Queue</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.10] text-white/50 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="pb-3">Counter</th>
                  <th className="pb-3">Service</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">In Queue</th>
                  <th className="pb-3 text-right">Est. Wait</th>
                  <th className="pb-3 text-right">Density</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {counters.slice(0, 5).map((c) => {
                  const statusColors = {
                    Active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                    Optimal: 'bg-[#2E37A4]/20 text-[#2E37A4] border-[#2E37A4]/30',
                    Overloaded: 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse',
                    Idle: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                    Closed: 'bg-white/[0.06] text-white/50 border-white/[0.10]',
                  };

                  return (
                    <tr key={c.id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="py-3.5 font-bold text-white font-display">
                        {c.name}
                        <span className="block text-[10px] font-normal text-white/50">{c.staffName}</span>
                      </td>
                      <td className="py-3.5 text-white/80 font-medium">
                        {c.service}
                      </td>
                      <td className="py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border backdrop-blur-md ${statusColors[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3.5 text-right font-bold text-white">
                        {c.queueCount} <span className="font-normal text-white/40 text-[10px]">people</span>
                      </td>
                      <td className="py-3.5 text-right font-bold text-white">
                        {c.avgWaitMin} <span className="font-normal text-white/40 text-[10px]">min</span>
                      </td>
                      <td className="py-3.5 text-right">
                        <div className="w-16 ml-auto bg-white/[0.10] h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              c.utilizationPct > 85 ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]' : c.utilizationPct > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${c.utilizationPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-white/50 font-mono mt-0.5 block">{c.utilizationPct}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Arrival Trend Chart & Floorplan Heatmap mini */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Arrival Trend Mini-Chart (Frosted Glass Chart) */}
          <div className="glass-panel-elevated rounded-3xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white font-display">Arrival Trend & Forecast</h3>
                <p className="text-[11px] text-white/60">Historical vs AI Predicted inflow</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-semibold">
                <span className="flex items-center gap-1 text-white/50">
                  <span className="w-2 h-2 rounded-full bg-white/40" />
                  Historical
                </span>
                <span className="flex items-center gap-1 text-[#2E37A4]">
                  <span className="w-2 h-2 rounded-full bg-[#2E37A4] shadow-[0_0_6px_rgba(46,55,164,0.8)]" />
                  AI Forecast
                </span>
              </div>
            </div>

            {/* SVG Arrival Chart */}
            <div className="h-36 w-full pt-2">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 400 120">
                {/* Background grid lines */}
                <line x1="0" y1="30" x2="400" y2="30" stroke="var(--pc-border)" strokeWidth="1" />
                <line x1="0" y1="60" x2="400" y2="60" stroke="var(--pc-border)" strokeWidth="1" />
                <line x1="0" y1="90" x2="400" y2="90" stroke="var(--pc-border)" strokeWidth="1" />

                {/* Historical Line */}
                <path
                  d="M 20,85 Q 70,55 120,40 T 220,25 T 320,50 T 380,75"
                  fill="none"
                  stroke="var(--pc-border-strong)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />

                {/* AI Predicted Line */}
                <path
                  d="M 20,80 Q 70,50 120,30 T 220,12 T 320,38 T 380,68"
                  fill="none"
                  stroke="#2E37A4"
                  strokeWidth="3"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(46, 55, 164, 0.6))' }}
                />

                {/* Peak Highlight Circle */}
                <circle cx="220" cy="12" r="5" fill="#00D3C7" />
                <circle cx="220" cy="12" r="9" fill="#00D3C7" opacity="0.3" />
                
                {/* Labels */}
                <text x="20" y="115" fontSize="9" fill="var(--pc-text-muted)" textAnchor="middle">09:00</text>
                <text x="120" y="115" fontSize="9" fill="var(--pc-text-muted)" textAnchor="middle">10:30</text>
                <text x="220" y="115" fontSize="9" fill="#00D3C7" fontWeight="bold" textAnchor="middle">12:00 (Peak)</text>
                <text x="320" y="115" fontSize="9" fill="var(--pc-text-muted)" textAnchor="middle">14:00</text>
                <text x="380" y="115" fontSize="9" fill="var(--pc-text-muted)" textAnchor="middle">16:00</text>
              </svg>
            </div>
          </div>

          {/* Crowd Capacity Mini-Map */}
          <div className="glass-panel-elevated rounded-3xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white font-display">Crowd Capacity Heatmap</h3>
                <p className="text-[11px] text-white/60">LiDAR & Thermal zone densities</p>
              </div>
              <button
                onClick={() => onNavigateTab('crowd-intel')}
                className="text-xs font-semibold text-[#2E37A4] hover:text-[#a78bfa] flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>Full Floorplan</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {zones.slice(0, 3).map((z) => (
                <div key={z.id} className="p-3 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white">{z.name}</span>
                    <span className="block text-[10px] text-white/50">{z.sensorType} • {z.activeNodes} nodes</span>
                  </div>
                  <div className="text-right">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-md ${
                      z.densityPct >= 85 ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      {z.densityPct}% Full
                    </span>
                    <span className="block text-[10px] text-white/50 mt-0.5">{z.currentOccupancy} / {z.maxCapacity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
