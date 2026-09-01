import React, { useEffect, useRef, useState } from 'react';
import { Activity, TrendingDown, Info, Users, Clock } from 'lucide-react';
import { getVisitorInsights, type VisitorInsights } from '../../services/healthApi';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

/**
 * Hospital AI Insights — the RESULTS of operational intelligence, for a patient.
 *
 * The split this component exists to draw: opening a desk is a control and
 * belongs to administrators; the fact that the wait just halved is a result and
 * belongs to the person waiting. So there is not a single button here that
 * changes anything, and the endpoint behind it returns no other patient, no
 * staff member, and none of the arrival/service rates an operator uses.
 *
 * Every number comes from /api/visitor/insights, computed from current state on
 * each request. Nothing is stored client-side and nothing is estimated here, so
 * it cannot drift from what the hospital is actually doing.
 */

const CROWD_TONE: Record<string, string> = {
  clear: 'bg-[#E7F6EC] text-[var(--pc-success-text)] border-[#A6DCBB]',
  light: 'bg-[#E7F6EC] text-[var(--pc-success-text)] border-[#A6DCBB]',
  moderate: 'bg-[#FEF3E7] text-[#B54708] border-[#F5C08A]',
  busy: 'bg-[#FEE4E2] text-[var(--pc-danger-text)] border-[#F2B8B5]',
};

interface Change {
  service: string;
  from: number;
  to: number;
  desksFrom: number;
  desksTo: number;
}

export const HospitalInsightsPanel: React.FC = () => {
  const [data, setData] = useState<VisitorInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Set only when a reload genuinely differs from what was on screen. */
  const [change, setChange] = useState<Change | null>(null);
  const previous = useRef<VisitorInsights | null>(null);

  const load = async () => {
    try {
      setError(null);
      const next = await getVisitorInsights();

      // Compare against what the patient was actually looking at. The banner is
      // only honest if both numbers came from the server — never a guess about
      // what an optimisation "should" have done.
      const before = previous.current;
      if (before) {
        for (const q of next.queues) {
          const was = before.queues.find((p) => p.id === q.id);
          if (was && was.estimatedWaitMinutes !== q.estimatedWaitMinutes && was.openCounters !== q.openCounters) {
            setChange({
              service: q.service,
              from: was.estimatedWaitMinutes,
              to: q.estimatedWaitMinutes,
              desksFrom: was.openCounters,
              desksTo: q.openCounters,
            });
            break;
          }
        }
      }
      previous.current = next;
      setData(next);
    } catch (err: any) {
      setError(err?.message ?? 'Hospital insights could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // A slow safety net behind the live stream, which is what normally carries
    // an admin's change through within a second or two.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLiveUpdates(() => { load(); });

  if (loading) {
    return <div className="pc-card p-6 text-center text-xs text-[var(--pc-text-muted)]">Reading the hospital’s live queues…</div>;
  }
  if (error || !data) {
    return <div className="pc-card p-6 text-xs text-[var(--pc-danger-text)]">{error ?? 'Insights unavailable.'}</div>;
  }

  const improved = change && change.to < change.from;

  return (
    <div className="pc-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[var(--pc-primary)]">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Hospital AI insights</span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--pc-text-muted)]">
            What the hospital’s queue intelligence is doing right now, and how it affects your wait.
          </p>
        </div>
        <span className="rounded-full border border-[var(--pc-border)] bg-[var(--pc-page)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--pc-text-muted)]">
          View only
        </span>
      </div>

      {/* Shown only when the server's own numbers changed under the patient. */}
      {change && (
        <div className={`rounded-2xl border px-4 py-3 ${improved ? 'border-[#A6DCBB] bg-[#E7F6EC]' : 'border-[#F5C08A] bg-[#FEF3E7]'}`}>
          <p className={`flex items-center gap-2 text-xs font-bold ${improved ? 'text-[var(--pc-success-text)]' : 'text-[#B54708]'}`}>
            <TrendingDown className={`h-3.5 w-3.5 ${improved ? '' : 'rotate-180'}`} />
            AI operations update
          </p>
          <p className="mt-1 text-[11px] text-[var(--pc-text)]">
            {change.desksTo > change.desksFrom
              ? `${change.desksTo - change.desksFrom} more desk${change.desksTo - change.desksFrom === 1 ? '' : 's'} opened at ${change.service}. `
              : `${change.desksFrom - change.desksTo} desk${change.desksFrom - change.desksTo === 1 ? '' : 's'} closed at ${change.service}. `}
            Estimated wait changed from <strong>{change.from} min</strong> to <strong>{change.to} min</strong>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-page)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Waiting now</p>
          <p className="text-2xl font-light font-display text-[var(--pc-text)]">{data.crowd.currentQueue}</p>
        </div>
        <div className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-page)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Typical wait</p>
          <p className="text-2xl font-light font-display text-[var(--pc-text)]">{data.crowd.currentWaitMinutes}<span className="text-xs text-[var(--pc-text-muted)]"> min</span></p>
        </div>
        <div className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-page)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pc-text-subtle)]">Shortest queue</p>
          <p className="text-sm font-semibold text-[var(--pc-text)] truncate">
            {data.quietest ? data.quietest.service : 'No queues right now'}
          </p>
          {data.quietest && <p className="text-[11px] text-[var(--pc-text-muted)]">~{data.quietest.estimatedWaitMinutes} min</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        {data.queues.map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pc-border)] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--pc-text)]">{q.service}</p>
              <p className="text-[10px] text-[var(--pc-text-muted)]">
                {q.counter ? `${q.counter} · ` : ''}{q.openCounters} desk{q.openCounters === 1 ? '' : 's'} open
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] text-[var(--pc-text-muted)]">
                <Users className="h-3 w-3" />{q.waiting}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--pc-text-muted)]">
                <Clock className="h-3 w-3" />~{q.estimatedWaitMinutes}m
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${CROWD_TONE[q.crowdLevel]}`}>
                {q.crowdLevel}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Patients ask why somebody went ahead of them; silence is a worse answer. */}
      <details className="rounded-xl border border-[var(--pc-border)] bg-[var(--pc-page)] px-3 py-2">
        <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-[var(--pc-text)]">
          <Info className="h-3 w-3" /> How the queue order is decided
        </summary>
        <ul className="mt-2 space-y-1">
          {data.policy.map((line, i) => (
            <li key={i} className="text-[11px] text-[var(--pc-text-muted)]">• {line}</li>
          ))}
        </ul>
      </details>

      <p className="text-[10px] leading-relaxed text-[var(--pc-text-subtle)]">
        {data.methodLabel}. {data.crowd.basisNote}
      </p>
    </div>
  );
};
