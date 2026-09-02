import React, { useEffect, useState } from 'react';
import { Sparkles, Ticket, CalendarPlus, MapPin, ArrowRight, Clock } from 'lucide-react';
import { HospitalInsightsPanel } from './HospitalInsightsPanel';
import { visitorApi } from '../../services/queueApi';
import { getVisitorInsights, type VisitorInsights } from '../../services/healthApi';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import type { PublicQueueToken } from '../VisitorFlow';

/**
 * The Command Center overview, as a patient should see it.
 *
 * The operational overview is not simply hidden from them — it is replaced.
 * That screen carries an "Apply Recommendation" button, live counter staffing
 * and the simulated LiDAR heatmap: an action a patient must not have, and two
 * readings they cannot act on. Rendering it with pieces disabled would leave a
 * page mostly about somebody else's job, and one forgotten `disabled` away from
 * handing over a control.
 *
 * So this is built from what a patient actually needs — where their own visit
 * stands, how busy the hospital is, and what they can do next — out of
 * components already proven safe for this audience. There is no operational
 * mutation reachable from this file.
 */
interface Props {
  onOpenNavigator?: () => void;
  onBookAppointment?: () => void;
  onJoinQueue?: () => void;
}

export const VisitorOverview: React.FC<Props> = ({ onOpenNavigator, onBookAppointment, onJoinQueue }) => {
  const [token, setToken] = useState<PublicQueueToken | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [insights, setInsights] = useState<VisitorInsights | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // The first two are the patient's own, resolved from their session
    // server-side. The third is the public board every kiosk already displays.
    const [t, a, i] = await Promise.all([
      visitorApi.getMyActiveToken().catch(() => null),
      visitorApi.getMyAppointments().catch(() => [] as any[]),
      getVisitorInsights().catch(() => null),
    ]);
    setToken(t);
    setAppointments(Array.isArray(a) ? a : []);
    setInsights(i);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useLiveUpdates(() => { load(); });

  const next = appointments[0] ?? null;

  return (
    <div className="pc space-y-6 pb-12 text-[var(--pc-text)]">
      <div>
        <h1 className="text-2xl font-bold font-display text-[var(--pc-text)]">Your visit</h1>
        <p className="mt-1 text-xs text-[var(--pc-text-muted)]">
          Where you stand right now, and how busy the hospital is.
        </p>
      </div>

      {/* The same headline figures the operations overview leads with, from the
          same live queue. What is absent is deliberate: no fairness score, no
          named staff, and no Apply Recommendation — an internal metric, a
          colleague's name, and a control, none of which belong to a patient. */}
      {insights && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="pc-card p-5">
            <span className="text-xs font-medium text-[var(--pc-text-muted)]">People waiting</span>
            <div className="mt-0.5 font-display text-2xl font-light text-[var(--pc-text)]">
              {insights.crowd.currentQueue}
            </div>
          </div>
          <div className="pc-card p-5">
            <span className="text-xs font-medium text-[var(--pc-text-muted)]">Typical wait</span>
            <div className="mt-0.5 font-display text-2xl font-light text-[var(--pc-text)]">
              {insights.crowd.currentWaitMinutes}<span className="text-sm text-[var(--pc-text-muted)]"> min</span>
            </div>
          </div>
          <div className="pc-card p-5">
            <span className="text-xs font-medium text-[var(--pc-text-muted)]">Shortest queue</span>
            <div className="mt-0.5 truncate text-sm font-semibold text-[var(--pc-text)]">
              {insights.quietest ? insights.quietest.service : 'No queues'}
            </div>
            {insights.quietest && (
              <span className="text-[11px] text-[var(--pc-text-muted)]">~{insights.quietest.estimatedWaitMinutes} min</span>
            )}
          </div>
          <div className="pc-card p-5">
            <span className="text-xs font-medium text-[var(--pc-text-muted)]">Desks open</span>
            <div className="mt-0.5 font-display text-2xl font-light text-[var(--pc-text)]">
              {insights.queues.reduce((n, q) => n + q.openCounters, 0)}
            </div>
          </div>
        </div>
      )}

      {/* The patient's own position — the thing they actually came to check. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="pc-card p-5">
          <div className="flex items-center gap-2 text-[var(--pc-primary)]">
            <Ticket className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Your queue token</span>
          </div>
          {loading ? (
            <p className="mt-3 text-xs text-[var(--pc-text-muted)]">Checking…</p>
          ) : token ? (
            <>
              <p className="mt-2 font-mono text-2xl font-bold text-[var(--pc-text)]">{token.code}</p>
              <p className="text-xs text-[var(--pc-text-muted)]">
                {token.serviceName} · {token.peopleAhead} ahead · ~{token.estimatedWaitMinutes} min
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-[var(--pc-text-muted)]">You are not in a queue.</p>
              {onJoinQueue && (
                <button onClick={onJoinQueue} className="pc-btn-ghost mt-3 px-3.5 py-1.5 text-[11px] font-semibold cursor-pointer">
                  Take a token
                </button>
              )}
            </>
          )}
        </div>

        <div className="pc-card p-5">
          <div className="flex items-center gap-2 text-[var(--pc-primary)]">
            <CalendarPlus className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Next appointment</span>
          </div>
          {loading ? (
            <p className="mt-3 text-xs text-[var(--pc-text-muted)]">Checking…</p>
          ) : next ? (
            <>
              <p className="mt-2 text-sm font-semibold text-[var(--pc-text)]">{next.doctor ?? 'Your doctor'}</p>
              <p className="text-xs text-[var(--pc-text-muted)] flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {next.date} · {next.time}{next.status ? ` · ${next.status}` : ''}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-[var(--pc-text-muted)]">Nothing booked.</p>
              {onBookAppointment && (
                <button onClick={onBookAppointment} className="pc-btn-ghost mt-3 px-3.5 py-1.5 text-[11px] font-semibold cursor-pointer">
                  Book an appointment
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Hospital status: the results of the operational intelligence, never
          its controls. Same component the health navigator uses. */}
      <HospitalInsightsPanel />

      {onOpenNavigator && (
        <button
          onClick={onOpenNavigator}
          className="pc-card flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-[var(--pc-page)] cursor-pointer"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--pc-tint-lilac)]">
              <Sparkles className="h-4 w-4 text-[var(--pc-primary)]" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[var(--pc-text)]">Not sure where to go?</span>
              <span className="block text-[11px] text-[var(--pc-text-muted)]">
                Describe your symptoms or upload a report, and we will suggest a department.
              </span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--pc-text-subtle)]" />
        </button>
      )}

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-[var(--pc-text-subtle)]">
        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
        Queue numbers are live from the ticket system. Operational controls — opening desks, changing
        schedules — are handled by hospital staff.
      </p>
    </div>
  );
};
