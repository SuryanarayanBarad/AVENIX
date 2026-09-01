import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { healthApi, type CrowdForecastResponse } from '../../services/healthApi';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

/**
 * Live crowd forecast and what to do about it.
 *
 * This replaced a tile reading "AI Inflow Velocity +12.4%", which was a
 * constant in the source labelled as an AI output. Everything here is measured:
 * arrivals and completions over the last hour, plus appointments already booked
 * into the window. It is a queueing model, and it says so — calling arithmetic
 * "AI" is how a demo stops being believable.
 */
const RISK_TONE: Record<string, string> = {
  low: 'bg-[#E7F6EC] text-[var(--pc-success-text)] border-[#A6DCBB]',
  moderate: 'bg-[#FEF3E7] text-[#B54708] border-[#F5C08A]',
  high: 'bg-[#FEE4E2] text-[var(--pc-danger-text)] border-[#F2B8B5]',
  critical: 'bg-[#FEE4E2] text-[var(--pc-danger-text)] border-[#F2B8B5]',
};

interface Props {
  /** True for callers with analytics:read, who get the operations detail. */
  operator?: boolean;
}

export const CrowdForecastPanel: React.FC<Props> = ({ operator = false }) => {
  const [data, setData] = useState<CrowdForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setError(null);
      setData(operator ? await healthApi.adminCrowd() : await healthApi.crowdForecast());
    } catch (err: any) {
      setError(err?.message ?? 'The forecast could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // The queue changes constantly; a stale forecast is worse than none.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator]);

  useLiveUpdates(() => { load(); });

  if (loading) {
    return (
      <div className="pc-card p-6 text-center text-xs text-[var(--pc-text-muted)]">
        Measuring the queue…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="pc-card p-6 text-xs text-[var(--pc-danger-text)]">
        {error ?? 'The forecast is unavailable.'}
      </div>
    );
  }

  const f = data.forecast;
  const Trend = f.netGrowthPerMin > 0.05 ? TrendingUp : f.netGrowthPerMin < -0.05 ? TrendingDown : Minus;
  const trendTone = f.netGrowthPerMin > 0.05
    ? 'text-[var(--pc-danger-text)]'
    : f.netGrowthPerMin < -0.05
      ? 'text-[var(--pc-success-text)]'
      : 'text-[var(--pc-text-muted)]';

  return (
    <div className="pc-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[var(--pc-primary)]">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Crowd forecast</span>
          </div>
          {/* Provenance, stated plainly. */}
          <p className="mt-1 text-[11px] text-[var(--pc-text-muted)]">{data.methodLabel}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${RISK_TONE[f.peakRisk]}`}>
          {f.peakRisk} risk
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Waiting now</p>
          <p className="text-2xl font-light font-display text-[var(--pc-text)]">{f.currentQueue}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Arrivals</p>
          <p className="text-2xl font-light font-display text-[var(--pc-text)]">
            {f.arrivalRatePerMin.toFixed(2)}<span className="text-xs text-[var(--pc-text-muted)]">/min</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Throughput</p>
          <p className="text-2xl font-light font-display text-[var(--pc-text)]">
            {f.serviceRatePerMin.toFixed(2)}<span className="text-xs text-[var(--pc-text-muted)]">/min</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Net</p>
          <p className={`text-2xl font-light font-display flex items-center gap-1 ${trendTone}`}>
            <Trend className="h-4 w-4" />
            {f.netGrowthPerMin > 0 ? '+' : ''}{f.netGrowthPerMin.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {f.horizons.map((h) => (
          <div key={h.minutes} className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-page)] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-[var(--pc-text-subtle)]">+{h.minutes} min</p>
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${RISK_TONE[h.risk]}`}>
                {h.risk}
              </span>
            </div>
            <p className="mt-1 text-xl font-light text-[var(--pc-text)]">{h.projectedQueue}</p>
            <p className="text-[10px] text-[var(--pc-text-muted)]">~{h.projectedWaitMinutes} min wait</p>
            {h.scheduledArrivals > 0 && (
              <p className="mt-0.5 text-[10px] text-[var(--pc-primary)]">{h.scheduledArrivals} booked</p>
            )}
          </div>
        ))}
      </div>

      {/* How much to trust the numbers, rather than leaving it implied. */}
      <p className="text-[10px] leading-relaxed text-[var(--pc-text-subtle)]">{f.basisNote}</p>

      {operator && data.capacity && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="rounded-full border border-[var(--pc-border)] bg-[var(--pc-page)] px-2.5 py-1 text-[var(--pc-text-muted)]">
            {data.capacity.openCounters} serving
          </span>
          <span className="rounded-full border border-[var(--pc-border)] bg-[var(--pc-page)] px-2.5 py-1 text-[var(--pc-text-muted)]">
            {data.capacity.idleCounters} idle
          </span>
          {(data.departmentLoad ?? []).slice(0, 3).map((d) => (
            <span key={d.service} className="rounded-full border border-[var(--pc-border)] bg-[var(--pc-page)] px-2.5 py-1 text-[var(--pc-text-muted)]">
              {d.service}: {d.waiting}
            </span>
          ))}
        </div>
      )}

      {operator && f.recommendations.length > 0 && (
        <div className="space-y-2 border-t border-[var(--pc-border)] pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--pc-text-subtle)]">
            Recommended actions
          </p>
          {f.recommendations.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border p-3 ${
                r.actionable ? 'border-[#C7C9F0] bg-[var(--pc-tint-lilac)]' : 'border-[var(--pc-border)] bg-[var(--pc-page)]'
              }`}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--pc-text)]">
                {r.actionable
                  ? <ArrowRight className="h-3.5 w-3.5 text-[var(--pc-primary)]" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-[var(--pc-text-subtle)]" />}
                {r.action}
              </p>
              {/* Every recommendation names the number behind it, so a
                  supervisor can disagree with the reasoning, not just the
                  conclusion. */}
              <p className="mt-1 text-[11px] text-[var(--pc-text-muted)]">{r.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
