import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, Minus, Plus, TrendingDown, AlertCircle } from 'lucide-react';
import { getVisitorInsights, setServiceCounters, type VisitorInsights } from '../../services/healthApi';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

/**
 * The operational control: how many desks serve each queue.
 *
 * This is the counterpart to HospitalInsightsPanel. That one shows results and
 * has no buttons; this one has the buttons and is refused to anyone without
 * queue:manage — server-side, so hiding it here is presentation only.
 *
 * It replaces a panel that posted mock counter objects to an unauthenticated
 * endpoint and applied a hardcoded transform to local state. Nothing it did
 * reached the database, so no patient ever experienced it. Each change here is
 * a real write, audited, and published so every waiting patient's screen
 * updates within seconds.
 */
export const ServiceCapacityPanel: React.FC = () => {
  const [data, setData] = useState<VisitorInsights | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastImpact, setLastImpact] = useState<{ service: string; before: number; after: number } | null>(null);

  const load = async () => {
    try {
      setData(await getVisitorInsights());
    } catch (err: any) {
      setError(err?.message ?? 'Queues could not be loaded.');
    }
  };

  useEffect(() => { load(); }, []);
  useLiveUpdates(() => { load(); });

  const change = async (serviceId: string, next: number) => {
    if (next < 1 || next > 12) return;
    setBusyId(serviceId);
    setError(null);
    try {
      const result = await setServiceCounters(serviceId, next);
      // The before/after comes from the server, measured against the same
      // queue on both sides. Computing it here would be a guess dressed as a
      // measurement.
      setLastImpact({
        service: result.service.name,
        before: result.impact.beforeWaitMinutes,
        after: result.impact.afterWaitMinutes,
      });
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'That change could not be applied.');
    } finally {
      setBusyId(null);
    }
  };

  if (!data) {
    return <div className="pc-card p-6 text-center text-xs text-[var(--pc-text-muted)]">Loading queues…</div>;
  }

  return (
    <div className="pc-card p-6 space-y-4">
      <div className="flex items-center gap-2 text-[var(--pc-primary)]">
        <SlidersHorizontal className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-wider">Counter allocation</span>
      </div>
      <p className="text-[11px] text-[var(--pc-text-muted)]">
        Opening a desk shortens that queue for everyone waiting in it. Changes are audited and appear on
        patients’ screens within seconds.
      </p>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-[#F2B8B5] bg-[#FEE4E2] px-3 py-2 text-xs text-[var(--pc-danger-text)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
        </p>
      )}

      {lastImpact && (
        <p className="flex items-center gap-2 rounded-xl border border-[#A6DCBB] bg-[#E7F6EC] px-3 py-2 text-xs text-[var(--pc-success-text)]">
          <TrendingDown className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>{lastImpact.service}</strong> estimated wait {lastImpact.before} min → {lastImpact.after} min.
          </span>
        </p>
      )}

      <div className="space-y-1.5">
        {data.queues.map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pc-border)] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--pc-text)]">{q.service}</p>
              <p className="text-[10px] text-[var(--pc-text-muted)]">
                {q.waiting} waiting · ~{q.estimatedWaitMinutes} min
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => change(q.id, q.openCounters - 1)}
                disabled={busyId === q.id || q.openCounters <= 1}
                aria-label={`Close a desk at ${q.service}`}
                className="pc-btn-ghost rounded-lg p-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-14 text-center text-xs font-semibold text-[var(--pc-text)]">
                {busyId === q.id ? '…' : `${q.openCounters} desk${q.openCounters === 1 ? '' : 's'}`}
              </span>
              <button
                onClick={() => change(q.id, q.openCounters + 1)}
                disabled={busyId === q.id || q.openCounters >= 12}
                aria-label={`Open a desk at ${q.service}`}
                className="pc-btn-ghost rounded-lg p-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
