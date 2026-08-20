import React, { useState } from 'react';
import { 
  Scale, 
  ShieldCheck, 
  Sparkles, 
  History, 
  CheckCircle2, 
  Heart, 
  Clock
} from 'lucide-react';
import { FairnessWeight, DecisionLogEntry } from '../types';

interface FairnessLogicViewProps {
  weights: FairnessWeight[];
  decisionLogs: DecisionLogEntry[];
  onUpdateWeight: (id: string, newMultiplier: number) => void;
  onOpenCopilot: (prompt?: string) => void;
}

export const FairnessLogicView: React.FC<FairnessLogicViewProps> = ({
  weights,
  decisionLogs,
  onUpdateWeight,
  onOpenCopilot,
}) => {
  const [fairnessWeights, setFairnessWeights] = useState<FairnessWeight[]>(weights);

  const handleSliderChange = (id: string, val: number) => {
    const updated = fairnessWeights.map(w => w.id === id ? { ...w, multiplier: val } : w);
    setFairnessWeights(updated);
    onUpdateWeight(id, val);
  };

  return (
    <div className="space-y-6 pb-12 text-white">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white font-display">Fairness & Transparent AI Logic</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#8e7dff]/20 text-[#8e7dff] border border-[#8e7dff]/30 backdrop-blur-md">
              Audit Grade: A+ (94/100)
            </span>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Explainable prioritization engine balancing clinical triage urgency with anti-starvation waiting SLAs.
          </p>
        </div>

        <button
          onClick={() => onOpenCopilot('Explain the mathematical fairness principles behind QueueMind multi-factor routing')}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-purple-600 hover:opacity-90 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#8e7dff]/30 transition-all self-start sm:self-auto cursor-pointer border border-white/20"
        >
          <Sparkles className="w-4 h-4 text-white animate-pulse" />
          <span>Audit Fairness Report</span>
        </button>
      </div>

      {/* 3 Top Pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="p-5 rounded-3xl glass-panel-elevated space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Fairness Index</span>
            <div className="w-8 h-8 rounded-2xl bg-[#8e7dff]/20 text-[#8e7dff] flex items-center justify-center font-bold border border-[#8e7dff]/30">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-light text-white font-display">
            94 <span className="text-xs font-normal text-white/50">/ 100</span>
          </div>
          <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>+18% fairness over unassisted FIFO</span>
          </p>
        </div>

        <div className="p-5 rounded-3xl glass-panel-elevated space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Anti-Starvation SLA</span>
            <div className="w-8 h-8 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold border border-emerald-500/30">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-light text-white font-display">
            100% <span className="text-xs font-normal text-white/50">Compliance</span>
          </div>
          <p className="text-[11px] text-white/60">
            Zero patients waiting over 35 min ceiling
          </p>
        </div>

        <div className="p-5 rounded-3xl glass-panel-elevated space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Demographic Protection</span>
            <div className="w-8 h-8 rounded-2xl bg-[#ff7db8]/20 text-[#ff7db8] flex items-center justify-center font-bold border border-[#ff7db8]/30">
              <Heart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-light text-white font-display">
            2.0x <span className="text-xs font-normal text-white/50">Elderly Weight</span>
          </div>
          <p className="text-[11px] text-white/60">
            Protected routing active for vulnerable visitors
          </p>
        </div>

      </div>

      {/* Grid: Priority Weight Rules (Left 7 cols) & Decision Transparency Audit Log (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Priority Weight Adjusters (7 cols) */}
        <div className="lg:col-span-7 glass-panel-elevated rounded-3xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.10] pb-3">
            <div>
              <h2 className="text-base font-bold text-white font-display">Priority Rules & Multipliers</h2>
              <p className="text-xs text-white/60">Interactive weights applied to queue positioning logic</p>
            </div>
            <span className="text-[10px] font-bold text-[#8e7dff] bg-[#8e7dff]/20 px-2.5 py-1 rounded-full border border-[#8e7dff]/30 backdrop-blur-md">
              Real-time Active
            </span>
          </div>

          <div className="space-y-4">
            {fairnessWeights.map((w) => (
              <div key={w.id} className="p-4 rounded-2xl glass-panel space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-xs text-white">{w.name}</h3>
                    <p className="text-[11px] text-white/60 mt-0.5">{w.description}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span className="font-extrabold text-[#8e7dff] font-mono text-sm bg-white/[0.08] px-2.5 py-1 rounded-xl border border-white/[0.12] backdrop-blur-md">
                      {w.multiplier.toFixed(1)}x
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[10px] text-white/40 font-mono">1.0x</span>
                  <input
                    type="range"
                    min="1.0"
                    max={w.category === 'Clinical' ? '10.0' : '3.0'}
                    step="0.1"
                    value={w.multiplier}
                    onChange={(e) => handleSliderChange(w.id, parseFloat(e.target.value))}
                    className="w-full accent-[#8e7dff] cursor-pointer"
                  />
                  <span className="text-[10px] text-white/40 font-mono">
                    {w.category === 'Clinical' ? '10.0x' : '3.0x'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Real-Time Explainable Decision Log (5 cols) */}
        <div className="lg:col-span-5 glass-panel-elevated rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.10] pb-3">
            <div>
              <h2 className="text-base font-bold text-white font-display">Decision Audit Trail</h2>
              <p className="text-xs text-white/60">Live verifiable log of AI routing decisions</p>
            </div>
            <History className="w-4 h-4 text-white/40" />
          </div>

          <div className="space-y-3">
            {decisionLogs.map((log) => (
              <div key={log.id} className="p-3.5 rounded-2xl glass-panel space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#8e7dff] font-mono">{log.tokenId}</span>
                    <span className="font-bold text-white">{log.action}</span>
                  </div>
                  <span className="text-[10px] text-white/40 font-mono">{log.timestamp}</span>
                </div>

                <p className="text-[11px] text-white/70 leading-relaxed">{log.reason}</p>

                <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-white/[0.08]">
                  <span className="font-semibold text-emerald-400">{log.fairnessDelta}</span>
                  <span className="text-white/40 font-mono">{log.confidence}% AI Confidence</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-2xl bg-[#8e7dff]/15 border border-[#8e7dff]/30 text-white text-xs flex items-center gap-2.5 backdrop-blur-md">
            <ShieldCheck className="w-4 h-4 text-[#8e7dff] shrink-0" />
            <span className="text-[11px] text-white/80">All decision rationale is cryptographically logged for clinical compliance.</span>
          </div>
        </div>

      </div>

    </div>
  );
};
