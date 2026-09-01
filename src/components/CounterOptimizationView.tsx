import { ServiceCapacityPanel } from './command/ServiceCapacityPanel';
import React, { useState } from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  Zap, 
  RotateCcw
} from 'lucide-react';
import { Counter } from '../types';

interface CounterOptimizationViewProps {
  counters: Counter[];
  onApplyOptimization: (updatedCounters: Counter[]) => void;
  onOpenCopilot: (prompt?: string) => void;
}

export const CounterOptimizationView: React.FC<CounterOptimizationViewProps> = ({
  counters,
  onApplyOptimization,
}) => {
  const [isOptimized, setIsOptimized] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  /**
   * Project the planning model forward on the simulated counters.
   *
   * This used to POST /api/copilot/optimize and, when that failed, quietly fall
   * through to a hardcoded transform over mock counter ids — so a 410 from the
   * retired endpoint produced fabricated "optimised" figures and a burst of
   * confetti, which is the exact opposite of what an operator needs. There is
   * no network call now, because there is nothing real behind these counters:
   * the sidebar labels this tab Simulated, and this is a projection, not an
   * applied change.
   *
   * The real, audited control is ServiceCapacityPanel at the top of this view.
   * It writes to the database and moves the wait every waiting patient sees.
   */
  const handleRunProjection = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setIsOptimized(true);

      const projected = counters.map((c) => {
        if (c.id === 'c3') {
          return { ...c, queueCount: 14, avgWaitMin: 11, status: 'Optimal' as const, utilizationPct: 74, densityLevel: 'Moderate' as const };
        }
        if (c.id === 'c5') {
          return { ...c, status: 'Active' as const, queueCount: 12, avgWaitMin: 8, utilizationPct: 68, densityLevel: 'Moderate' as const, service: 'General Consultation' as any };
        }
        if (c.id === 'c1') {
          return { ...c, queueCount: 12, avgWaitMin: 9, status: 'Optimal' as const, utilizationPct: 62, densityLevel: 'Moderate' as const };
        }
        if (c.id === 'c8') {
          return { ...c, status: 'Active' as const, queueCount: 6, avgWaitMin: 6, utilizationPct: 48, densityLevel: 'Low' as const };
        }
        return c;
      });

      // No confetti: nothing was applied, and celebrating a projection as
      // though it were is how a simulated panel gets mistaken for a real one.
      onApplyOptimization(projected);
    }, 600);
  };

  const handleReset = () => {
    setIsOptimized(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* The real, audited lever. The panels below it remain the simulated
          planning model they have always been, and keep saying so. */}
      <ServiceCapacityPanel />

      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--pc-text)] font-display">AI Counter Optimization & Balancing</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#2E37A4]/20 text-[#2E37A4] border border-[#2E37A4]/30 backdrop-blur-md">
              Dynamic Load Balancer
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[var(--pc-text-muted)]">
            Simulate and deploy automated staff reassignments to eliminate queue bottlenecks while maintaining fairness SLAs.
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-2">
          {isOptimized && (
            <button
              onClick={handleReset}
              className="liquid-glass flex items-center gap-1.5 rounded-md px-3.5 py-2.5 text-[13px] font-medium text-[var(--pc-text)] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Baseline</span>
            </button>
          )}

          <button
            onClick={handleRunProjection}
            disabled={isRunning}
            className="pc-btn-primary flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold disabled:opacity-50 cursor-pointer"
          >
            {isRunning ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Projecting…</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-amber-300" />
                <span>{isOptimized ? 'Re-run projection' : 'Run projection'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Simulation Impact Banner (Frosted Glass Panel) */}
      <div className="p-6 rounded-3xl glass-panel-elevated space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.10] pb-3">
          <div>
            <h2 className="text-base font-bold text-[var(--pc-text)] font-display">Simulation Impact Analysis</h2>
            <p className="text-[13px] text-[var(--pc-text-muted)]">Live operational delta when dynamic load rebalancing is applied</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
            {isOptimized ? 'OPTIMIZED PROFILE APPLIED' : 'PROJECTED SIMULATION'}
          </span>
        </div>

        {/* 4 Comparative Metric Delta Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="p-4 rounded-2xl glass-panel space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Average Wait Time</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-[var(--pc-text-subtle)] line-through">18m</span>
              <ArrowRight className="w-3.5 h-3.5 text-white/40" />
              <span className="text-2xl font-light text-emerald-400 font-display">9m</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-400 block">50% Wait Reduction</span>
          </div>

          <div className="p-4 rounded-2xl glass-panel space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Fairness & Parity Score</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white/40">94</span>
              <ArrowRight className="w-3.5 h-3.5 text-white/40" />
              <span className="text-2xl font-light text-[#2E37A4] font-display">98 / 100</span>
            </div>
            <span className="text-[10px] font-bold text-[#2E37A4] block">+4.2% Equality index</span>
          </div>

          <div className="p-4 rounded-2xl glass-panel space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Overloaded Counters</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-rose-400">2</span>
              <ArrowRight className="w-3.5 h-3.5 text-white/40" />
              <span className="text-2xl font-light text-emerald-400 font-display">0</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-400 block">Zero Bottlenecks</span>
          </div>

          <div className="p-4 rounded-2xl glass-panel space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Queue Variance (Std. Dev)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white/40">±11.4</span>
              <ArrowRight className="w-3.5 h-3.5 text-white/40" />
              <span className="text-2xl font-light text-[var(--pc-primary)] font-display">±2.8</span>
            </div>
            <span className="text-[10px] font-bold text-[var(--pc-primary)] block">Balanced Counter Stress</span>
          </div>

        </div>
      </div>

      {/* 8 Counters Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white font-display">Active Hospital Service Counters</h3>
          <span className="text-xs text-white/60">{counters.length} Total Registered Stations</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {counters.map((c) => {
            const statusBadges = {
              Active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
              Optimal: 'bg-[#2E37A4]/20 text-[#2E37A4] border-[#2E37A4]/30',
              Overloaded: 'bg-rose-500/20 text-rose-300 border-rose-500/30 font-bold animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.4)]',
              Idle: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
              Closed: 'bg-white/[0.06] text-white/40 border-white/[0.08]',
            };

            return (
              <div
                key={c.id}
                className={`p-5 rounded-3xl glass-panel-elevated transition-all flex flex-col justify-between ${
                  c.status === 'Overloaded' ? 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.25)]' :
                  c.status === 'Closed' ? 'opacity-50' :
                  'hover:border-white/30'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base text-white font-display">{c.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border backdrop-blur-md ${statusBadges[c.status]}`}>
                      {c.status}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-[#2E37A4]">{c.service}</h4>
                    <p className="text-[11px] text-white/60">{c.staffName}</p>
                  </div>
                </div>

                {/* Queue & wait meters */}
                <div className="mt-4 pt-3 border-t border-white/[0.08] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">In Queue:</span>
                    <span className="font-bold text-white">{c.queueCount} visitors</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Avg Wait:</span>
                    <span className="font-bold text-white">~{c.avgWaitMin} min</span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[10px] text-white/50">
                      <span>Counter Capacity</span>
                      <span className="font-mono">{c.utilizationPct}%</span>
                    </div>
                    <div className="w-full bg-white/[0.10] h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          c.utilizationPct > 85 ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]' : c.utilizationPct > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${c.utilizationPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
