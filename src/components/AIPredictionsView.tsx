import React, { useState } from 'react';
import { 
  Sparkles, 
  Clock, 
  SlidersHorizontal, 
  Zap
} from 'lucide-react';
import { PredictionPoint } from '../types';

interface AIPredictionsViewProps {
  predictions: PredictionPoint[];
  onOpenCopilot: (prompt?: string) => void;
  onNavigateCounterOpt: () => void;
}

export const AIPredictionsView: React.FC<AIPredictionsViewProps> = ({
  predictions,
  onOpenCopilot,
  onNavigateCounterOpt,
}) => {
  const [timeHorizon, setTimeHorizon] = useState<'15m' | '30m' | '1h' | '4h' | 'today'>('1h');
  const [surgeMultiplier, setSurgeMultiplier] = useState<number>(1.0);

  // How many hourly slots each horizon covers. The series is hourly, so the
  // sub-hour horizons both show the next slot — they differ in the surge window
  // the copilot reasons about, not in how much of the curve is drawn.
  const HORIZON_SLOTS: Record<typeof timeHorizon, number> = {
    '15m': 1,
    '30m': 1,
    '1h': 2,
    '4h': 5,
    today: predictions.length,
  };

  // The horizon pills used to change only their own highlight — the chart below
  // always drew the full day regardless of which one was selected. They now
  // actually narrow the forecast window.
  const horizonPredictions = predictions.slice(0, Math.max(1, HORIZON_SLOTS[timeHorizon]));

  // Bar spacing follows the number of slots on screen so the chart fills its
  // frame at any horizon, keeping the same look as the full-day view.
  const barStep = Math.max(46, Math.min(58, 440 / Math.max(1, HORIZON_SLOTS[timeHorizon])));

  // Scaled prediction based on simulated surge
  const scaledPredictions = horizonPredictions.map((p) => ({
    ...p,
    predictedArrivals: Math.round(p.predictedArrivals * surgeMultiplier),
    predictedWaitMin: Math.round(p.predictedWaitMin * (1 + (surgeMultiplier - 1) * 1.4)),
    upperBoundWait: Math.round(p.upperBoundWait * (1 + (surgeMultiplier - 1) * 1.4)),
    lowerBoundWait: Math.round(p.lowerBoundWait * (1 + (surgeMultiplier - 1) * 1.4)),
  }));

  return (
    <div className="space-y-6 pb-12 text-white">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white font-display">AI Arrival & Wait-Time Forecasts</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#2E37A4]/20 text-[#2E37A4] border border-[#2E37A4]/30 backdrop-blur-md">
              94% Model Confidence
            </span>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Predictive machine learning models trained on historical patient inflows, clinic appointments, and real-time LiDAR telemetry.
          </p>
        </div>

        {/* Time Horizon Pills */}
        <div className="flex items-center bg-white/[0.06] p-1 rounded-2xl border border-white/[0.12] text-xs font-medium backdrop-blur-md">
          {(['15m', '30m', '1h', '4h', 'today'] as const).map((horizon) => (
            <button
              key={horizon}
              onClick={() => setTimeHorizon(horizon)}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                timeHorizon === horizon
                  ? 'liquid-glass-active font-semibold'
                  : 'text-[var(--pc-text-muted)] hover:text-[var(--pc-text)]'
              }`}
            >
              {horizon === 'today' ? 'Full Day' : horizon}
            </button>
          ))}
        </div>
      </div>

      {/* AI Copilot Insights Banner (Frosted Glass Banner) */}
      <div className="p-6 rounded-3xl glass-panel-elevated bg-[#12122b]/95 border border-white/[0.18] shadow-2xl relative overflow-hidden backdrop-blur-2xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#2E37A4] to-[#00D3C7] border border-white/20 flex items-center justify-center text-white shadow-lg shadow-[#2E37A4]/30 shrink-0">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#2E37A4]">
                  PREDICTIVE SURGE INSIGHT
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold backdrop-blur-md">
                  Peak at 12:15 PM
                </span>
              </div>
              <h3 className="text-lg font-bold font-display text-white">
                Expected Inflow: 86 arrivals/hr at 12:00 PM (~+28% above baseline)
              </h3>
              <p className="text-xs text-white/70 max-w-2xl leading-relaxed">
                If unmitigated, General Consultation wait times will breach the 30-minute SLA threshold. Recommended action: Open Counter 05 (Overflow) and Counter 08 (Backup).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onNavigateCounterOpt}
              className="px-4 py-2.5 rounded-2xl bg-[var(--pc-primary)] hover:opacity-90 text-white font-bold text-xs shadow-lg shadow-[#2E37A4]/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer border border-white/20"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Deploy Counter Balancer</span>
            </button>

            <button
              onClick={() => onOpenCopilot('Provide an in-depth breakdown of the 12:00 PM arrival surge forecast')}
              className="px-4 py-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-white font-semibold text-xs transition-all cursor-pointer backdrop-blur-md"
            >
              <span>Explain Model</span>
            </button>
          </div>

        </div>
      </div>

      {/* Interactive What-If Surge Simulation Slider (Frosted Glass Panel) */}
      <div className="p-5 glass-panel-elevated rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold border border-amber-500/30">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-white">What-If Demand Surge Simulator</span>
            <p className="text-[11px] text-white/60">Test how higher patient volume impacts projected waiting times.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-72">
          <span className="text-white/50 text-[11px] font-semibold">Baseline</span>
          <input
            type="range"
            min="1.0"
            max="1.5"
            step="0.1"
            value={surgeMultiplier}
            onChange={(e) => setSurgeMultiplier(parseFloat(e.target.value))}
            className="w-full accent-[#2E37A4] cursor-pointer"
          />
          <span className="font-bold text-[#2E37A4] font-mono text-xs w-12 text-right">
            +{Math.round((surgeMultiplier - 1) * 100)}%
          </span>
        </div>
      </div>

      {/* 2 Forecast Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Expected Arrivals (Historical vs Predicted) */}
        <div className="glass-panel-elevated rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white font-display">Expected Patient Arrivals (Inflow/hr)</h3>
              <p className="text-xs text-white/60">Historical Tuesday average vs Neural Network Prediction</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-white/50">
                <span className="w-2.5 h-2.5 rounded-full bg-white/30" />
                Historical
              </span>
              <span className="flex items-center gap-1.5 text-[#2E37A4]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2E37A4] shadow-[0_0_6px_rgba(46,55,164,0.8)]" />
                AI Forecast
              </span>
            </div>
          </div>

          {/* SVG Inflow Bars */}
          <div className="h-56 w-full pt-4">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 180">
              <line x1="0" y1="30" x2="500" y2="30" stroke="var(--pc-border)" strokeWidth="1" />
              <line x1="0" y1="75" x2="500" y2="75" stroke="var(--pc-border)" strokeWidth="1" />
              <line x1="0" y1="120" x2="500" y2="120" stroke="var(--pc-border)" strokeWidth="1" />

              {scaledPredictions.map((pt, i) => {
                const x = 30 + i * barStep;
                const histHeight = pt.historicalArrivals * 1.2;
                const predHeight = pt.predictedArrivals * 1.2;

                return (
                  <g key={pt.timeSlot}>
                    {/* Historical bar */}
                    <rect
                      x={x}
                      y={150 - histHeight}
                      width="16"
                      height={histHeight}
                      rx="4"
                      fill="var(--pc-page)"
                    />

                    {/* Predicted bar with gradient / glow */}
                    <rect
                      x={x + 18}
                      y={150 - predHeight}
                      width="16"
                      height={predHeight}
                      rx="4"
                      fill="#2E37A4"
                    />

                    {/* Time label */}
                    <text x={x + 16} y="170" fontSize="10" fill="var(--pc-text-muted)" textAnchor="middle">
                      {pt.timeSlot}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Chart 2: Predicted Wait Time with Confidence Bounds */}
        <div className="glass-panel-elevated rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white font-display">Predicted Average Wait Time</h3>
              <p className="text-xs text-white/60">Wait minutes forecast with 90% confidence bands</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300 bg-rose-500/20 px-2.5 py-1 rounded-full border border-rose-500/30 backdrop-blur-md">
              <Clock className="w-3.5 h-3.5" />
              <span>SLA Target: 20 min</span>
            </div>
          </div>

          {/* SVG Wait Time Forecast Line & Confidence Interval Area */}
          <div className="h-56 w-full pt-4">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 180">
              {/* SLA Target Line */}
              <line x1="0" y1="80" x2="500" y2="80" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
              <text x="490" y="75" fontSize="9" fill="#f43f5e" fontWeight="bold" textAnchor="end">SLA MAX (20m)</text>

              {/* Confidence Band Area */}
              <path
                d="M 30,130 Q 150,90 250,30 T 450,110 L 450,150 Q 350,90 250,70 T 30,150 Z"
                fill="#2E37A4"
                opacity="0.12"
              />

              {/* Predicted Line */}
              <path
                d="M 30,140 Q 150,100 250,48 T 450,130"
                fill="none"
                stroke="#2E37A4"
                strokeWidth="3.5"
                filter="drop-shadow(0 0 6px rgba(46,55,164,0.7))"
              />

              {/* Data points */}
              {scaledPredictions.map((pt, i) => {
                const x = 30 + i * barStep;
                const y = 160 - pt.predictedWaitMin * 3.5;
                const isOverSLA = pt.predictedWaitMin > 20;

                return (
                  <g key={pt.timeSlot}>
                    <circle
                      cx={x + 16}
                      cy={y}
                      r="5"
                      fill={isOverSLA ? '#f43f5e' : '#2E37A4'}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      x={x + 16}
                      y={y - 10}
                      fontSize="9"
                      fontWeight="bold"
                      fill={isOverSLA ? '#fca5a5' : '#ffffff'}
                      textAnchor="middle"
                    >
                      {pt.predictedWaitMin}m
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

      </div>

    </div>
  );
};
