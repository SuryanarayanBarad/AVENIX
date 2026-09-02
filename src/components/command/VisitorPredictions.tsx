import React, { useEffect, useState } from 'react';
import { TrendingUp, Clock, Users, Info } from 'lucide-react';
import { getVisitorInsights, type VisitorInsights } from '../../services/healthApi';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

/**
 * The forecast screen, for a patient.
 *
 * Deliberately not the operational AI Predictions view. That one is driven by
 * mockData — the sidebar labels it "Simulated" — and a simulated forecast is
 * fine for staff comparing planning scenarios and wrong for a patient deciding
 * whether to come in now or after lunch. They would act on it.
 *
 * This shows the real projection instead: the same queueing model the
 * operations side uses, over measured arrivals and throughput plus appointments
 * already booked. When the window is too thin to estimate a rate it says so
 * rather than drawing a confident line through noise.
 */

const RISK_TONE: Record<string, string> = {
  low: 'bg-[#E7F6EC] text-[var(--pc-success-text)] border-[#A6DCBB]',
  moderate: 'bg-[#FEF3E7] text-[#B54708] border-[#F5C08A]',
  high: 'bg-[#FEE4E2] text-[var(--pc-danger-text)] border-[#F2B8B5]',
  critical: 'bg-[#FEE4E2] text-[var(--pc-danger-text)] border-[#F2B8B5]',
};

export const VisitorPredictions: React.FC = () => {
  const [data, setData] = useState<VisitorInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setData(await getVisitorInsights());
    } catch (err: any) {
      setError(err?.message ?? 'The forecast could not be loaded.');
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);
  useLiveUpdates(() => { load(); });

  if (error) return <div className="pc-card p-6 text-xs text-[var(--pc-danger-text)]">{error}</div>;
  if (!data) return <div className="pc-card p-6 text-center text-xs text-[var(--pc-text-muted)]">Reading the live queue…</div>;

  const { crowd, queues } = data;
  const thin = crowd.basis === 'insufficient-data';

  // Scale the bars to the largest projection so the shape is readable at any
  // queue size. Never divide by zero on an empty hospital.
  const peak = Math.max(1, crowd.currentQueue, ...crowd.horizons.map((h) => h.projectedQueue));

  return (
    <div className="pc space-y-6 pb-12 text-[var(--pc-text)]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-[var(--pc-text)]">How busy it will be</h1>
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${RISK_TONE[crowd.peakRisk]}`}>
            {crowd.peakRisk} pressure
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--pc-text-muted)]">
          Projected from the queue moving right now — useful for deciding when to come in.
        </p>
      </div>

      {/* Said plainly, because a forecast nobody can weigh is worse than none. */}
      {thin && (
        <div className="flex items-start gap-2 rounded-2xl border border-[#F5C08A] bg-[#FEF3E7] px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#B54708]" />
          <p className="text-xs text-[#B54708]">
            <strong>Not enough recent arrivals to project a trend.</strong> The figures below show the queue as it
            stands rather than a prediction.
          </p>
        </div>
      )}

      <div className="pc-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-[var(--pc-primary)]">
          <TrendingUp className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Next hour</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-page)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Now</p>
            <p className="font-display text-xl font-light text-[var(--pc-text)]">{crowd.currentQueue}</p>
            <p className="text-[10px] text-[var(--pc-text-muted)]">~{crowd.currentWaitMinutes} min wait</p>
            <div className="mt-2 h-1.5 rounded-full bg-[var(--pc-border)]">
              <div className="h-full rounded-full bg-[var(--pc-primary)]" style={{ width: `${(crowd.currentQueue / peak) * 100}%` }} />
            </div>
          </div>

          {crowd.horizons.map((h) => (
            <div key={h.minutes} className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-page)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">
                In {h.minutes} min
              </p>
              <p className="font-display text-xl font-light text-[var(--pc-text)]">{h.projectedQueue}</p>
              <p className="text-[10px] text-[var(--pc-text-muted)]">~{h.projectedWaitMinutes} min wait</p>
              <div className="mt-2 h-1.5 rounded-full bg-[var(--pc-border)]">
                <div
                  className={`h-full rounded-full ${h.projectedQueue > crowd.currentQueue ? 'bg-[var(--pc-danger)]' : 'bg-[var(--pc-success)]'}`}
                  style={{ width: `${(h.projectedQueue / peak) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Provenance, stated rather than implied. Not a language model. */}
        <p className="text-[10px] leading-relaxed text-[var(--pc-text-subtle)]">
          {data.methodLabel}. {crowd.basisNote}
        </p>
      </div>

      <div className="pc-card p-6 space-y-3">
        <div className="flex items-center gap-2 text-[var(--pc-primary)]">
          <Users className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Where the wait is shortest</span>
        </div>
        {[...queues].sort((a, b) => a.estimatedWaitMinutes - b.estimatedWaitMinutes).map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pc-border)] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--pc-text)]">{q.service}</p>
              <p className="text-[10px] text-[var(--pc-text-muted)]">
                {q.counter ? `${q.counter} · ` : ''}{q.openCounters} desk{q.openCounters === 1 ? '' : 's'} open
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--pc-text)]">
              <Clock className="h-3 w-3 text-[var(--pc-text-subtle)]" />
              {q.waiting === 0 ? 'No queue' : `~${q.estimatedWaitMinutes} min`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
