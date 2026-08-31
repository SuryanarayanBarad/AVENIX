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

  // ---- chart geometry -------------------------------------------------
  // Both charts used fixed multipliers (`value * 1.2`, `160 - wait * 3.5`) with
  // no scale, so a busy forecast drew bars straight out of the frame and the
  // wait points drifted off the line. Deriving the scale from the data keeps
  // every series inside the plot at any horizon or surge setting.
  const PLOT_TOP = 26;
  const PLOT_BOTTOM = 150;
  const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;

  const maxArrivals = Math.max(
    1,
    ...scaledPredictions.map((p) => Math.max(p.historicalArrivals, p.predictedArrivals)),
  );
  const arrivalY = (value: number) => PLOT_BOTTOM - (value / maxArrivals) * PLOT_HEIGHT;

  // Always keep the 20-minute SLA line on screen, even on a calm forecast.
  const maxWait = Math.max(
    25,
    ...scaledPredictions.map((p) => Math.max(p.upperBoundWait, p.predictedWaitMin)),
  );
  const waitY = (value: number) => PLOT_BOTTOM - (value / maxWait) * PLOT_HEIGHT;
  const pointX = (i: number) => 30 + i * barStep + 16;

  /** Smooth-ish series path; a single point still renders as a dot. */
  const linePath = scaledPredictions
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${pointX(i)},${waitY(p.predictedWaitMin)}`)
    .join(' ');

  /** Confidence band drawn from the real bounds: up the highs, back the lows. */
  const bandPath = scaledPredictions.length > 1
    ? [
        ...scaledPredictions.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pointX(i)},${waitY(p.upperBoundWait)}`),
        ...scaledPredictions.slice().reverse().map((p, i) => {
          const idx = scaledPredictions.length - 1 - i;
          return `L ${pointX(idx)},${waitY(p.lowerBoundWait)}`;
        }),
        'Z',
      ].join(' ')
    : '';

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
              className="pc-btn-primary px-4 py-2.5 text-xs active:scale-95 transition-all flex items-center gap-2 cursor-pointer font-semibold"
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
              {/* Gridlines, each labelled so the bars can be read as numbers */}
              {[0, 0.5, 1].map((frac) => {
                const y = PLOT_BOTTOM - frac * PLOT_HEIGHT;
                return (
                  <g key={frac}>
                    <line x1="28" y1={y} x2="500" y2={y} stroke="var(--pc-border)" strokeWidth="1" />
                    <text x="24" y={y + 3} fontSize="9" fill="var(--pc-text-muted)" textAnchor="end">
                      {Math.round(maxArrivals * frac)}
                    </text>
                  </g>
                );
              })}

              {scaledPredictions.map((pt, i) => {
                const x = 30 + i * barStep;
                const histY = arrivalY(pt.historicalArrivals);
                const predY = arrivalY(pt.predictedArrivals);

                return (
                  <g key={pt.timeSlot}>
                    {/* Historical bar — was painted --pc-page, invisible on a white card */}
                    <rect
                      x={x}
                      y={histY}
                      width="16"
                      height={Math.max(0, PLOT_BOTTOM - histY)}
                      rx="4"
                      fill="var(--pc-border-strong)"
                    />

                    {/* Predicted bar */}
                    <rect
                      x={x + 18}
                      y={predY}
                      width="16"
                      height={Math.max(0, PLOT_BOTTOM - predY)}
                      rx="4"
                      fill="var(--pc-primary)"
                    />

                    {/* Predicted value, above its bar */}
                    <text
                      x={x + 26}
                      y={predY - 5}
                      fontSize="9"
                      fontWeight="bold"
                      fill="var(--pc-primary)"
                      textAnchor="middle"
                    >
                      {pt.predictedArrivals}
                    </text>

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
              {/* Gridlines with minute labels */}
              {[0, 0.5, 1].map((frac) => {
                const y = PLOT_BOTTOM - frac * PLOT_HEIGHT;
                return (
                  <g key={frac}>
                    <line x1="28" y1={y} x2="500" y2={y} stroke="var(--pc-border)" strokeWidth="1" />
                    <text x="24" y={y + 3} fontSize="9" fill="var(--pc-text-muted)" textAnchor="end">
                      {Math.round(maxWait * frac)}m
                    </text>
                  </g>
                );
              })}

              {/* SLA target, positioned on the same scale as the series */}
              <line
                x1="28" y1={waitY(20)} x2="500" y2={waitY(20)}
                stroke="var(--pc-danger)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.9"
              />
              <text x="498" y={waitY(20) - 5} fontSize="9" fill="var(--pc-danger-text)" fontWeight="bold" textAnchor="end">
                SLA MAX (20m)
              </text>

              {/* Confidence band, from the forecast's own bounds */}
              {bandPath && <path d={bandPath} fill="var(--pc-primary)" opacity="0.14" />}

              {/* Predicted line, following the points it is drawn with */}
              <path d={linePath} fill="none" stroke="var(--pc-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

              {/* Data points */}
              {scaledPredictions.map((pt, i) => {
                const x = pointX(i);
                const y = waitY(pt.predictedWaitMin);
                const isOverSLA = pt.predictedWaitMin > 20;

                return (
                  <g key={pt.timeSlot}>
                    <circle
                      cx={x}
                      cy={y}
                      r="5"
                      fill={isOverSLA ? 'var(--pc-danger)' : 'var(--pc-primary)'}
                      stroke="var(--pc-surface)"
                      strokeWidth="2"
                    />
                    {/* Was painted #ffffff on a white card, so every value was invisible */}
                    <text
                      x={x}
                      y={y - 11}
                      fontSize="9"
                      fontWeight="bold"
                      fill={isOverSLA ? 'var(--pc-danger-text)' : 'var(--pc-text)'}
                      textAnchor="middle"
                    >
                      {pt.predictedWaitMin}m
                    </text>
                    <text x={x} y="170" fontSize="10" fill="var(--pc-text-muted)" textAnchor="middle">
                      {pt.timeSlot}
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
