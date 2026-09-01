import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Users, Navigation } from 'lucide-react';
import { visitorApi } from '../../services/queueApi';
import type { VisitorServiceOption } from '../VisitorFlow';

/**
 * Ground-floor map for a visitor: where to go, and how busy it is when they
 * get there.
 *
 * Two different kinds of data, kept honestly distinct:
 *
 *  - The LAYOUT (which room is where) is a fixed floor plan. It is not derived
 *    from sensors and is not claimed to be. The coordinates are the same ones
 *    the operations floorplan uses, so the two views agree about the building.
 *  - The QUEUE COUNTS are real, read from /api/visitor/services, which is the
 *    public queue endpoint every visitor may already see. No LiDAR reading, no
 *    occupancy estimate, and nothing about any individual patient.
 *
 * The operations Crowd Intelligence screen shows simulated sensor density and
 * says so; this screen deliberately shows neither, because a number a visitor
 * cannot verify is worse than no number.
 */

/** Fixed floor layout. Percentages of the map frame. */
interface MapZone {
  id: string;
  name: string;
  /** The service whose live queue belongs to this room, when there is one. */
  serviceName: string | null;
  x: number; y: number; width: number; height: number;
  /** Shown when the room has no queue of its own. */
  note?: string;
}

const FLOOR_PLAN: MapZone[] = [
  { id: 'z-registration', name: 'Registration Atrium', serviceName: 'Registration', x: 4, y: 6, width: 42, height: 24 },
  { id: 'z-emergency', name: 'Emergency & Triage', serviceName: null, x: 54, y: 6, width: 42, height: 30, note: 'Walk straight in — no token needed' },
  { id: 'z-waiting', name: 'Main Waiting Lounge', serviceName: 'General Consultation', x: 4, y: 34, width: 42, height: 30 },
  { id: 'z-pharmacy', name: 'Pharmacy & Dispensing', serviceName: 'Pharmacy', x: 54, y: 40, width: 42, height: 24 },
  { id: 'z-billing', name: 'Billing & Insurance', serviceName: 'Billing', x: 4, y: 68, width: 42, height: 24 },
  { id: 'z-diagnostics', name: 'Diagnostics', serviceName: 'Diagnostics', x: 54, y: 68, width: 42, height: 24 },
];

/** Busy-ness bands, from the queue length alone. */
function band(waiting: number | undefined): { label: string; cls: string; dot: string } {
  if (waiting === undefined) return { label: '—', cls: 'bg-[var(--pc-page)] border-[var(--pc-border)]', dot: 'bg-[var(--pc-text-subtle)]' };
  if (waiting === 0) return { label: 'No queue', cls: 'bg-[#E7F6EC] border-[#A6DCBB]', dot: 'bg-[var(--pc-success)]' };
  if (waiting <= 5) return { label: 'Short queue', cls: 'bg-[#E7F6EC] border-[#A6DCBB]', dot: 'bg-[var(--pc-success)]' };
  if (waiting <= 15) return { label: 'Moderate', cls: 'bg-[#FEF3E7] border-[#F5C08A]', dot: 'bg-[#B54708]' };
  return { label: 'Busy', cls: 'bg-[#FEE4E2] border-[#F2B8B5]', dot: 'bg-[var(--pc-danger)]' };
}

interface Props {
  /** Highlights the room serving this department, after an AI suggestion. */
  highlightService?: string | null;
}

export const HospitalMapView: React.FC<Props> = ({ highlightService = null }) => {
  const [services, setServices] = useState<VisitorServiceOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      visitorApi.getServices()
        .then((s) => { if (mounted) { setServices(s); setLoading(false); } })
        .catch(() => { if (mounted) setLoading(false); });
    };
    load();
    // A minute is plenty: this tells somebody which way to walk, not which
    // second to leave.
    const timer = setInterval(load, 60_000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  const byName = useMemo(() => {
    const map = new Map<string, VisitorServiceOption>();
    for (const s of services) map.set(s.name, s);
    return map;
  }, [services]);

  const active = selected ?? highlightService;

  return (
    <div className="pc-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[var(--pc-primary)]">
          <MapPin className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Find your way</span>
        </div>
        <span className="text-[10px] text-[var(--pc-text-subtle)]">Ground floor</span>
      </div>

      <div className="relative w-full overflow-hidden rounded-2xl border border-[var(--pc-border)] bg-[var(--pc-page)]" style={{ aspectRatio: '4 / 3' }}>
        {/* Entrance marker, so the plan has an orientation a visitor can use. */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-lg border border-t-0 border-[var(--pc-border-strong)] bg-[var(--pc-surface)] px-2 py-0.5 text-[9px] font-bold text-[var(--pc-text-muted)]">
          MAIN ENTRANCE
        </div>

        {FLOOR_PLAN.map((zone) => {
          const svc = zone.serviceName ? byName.get(zone.serviceName) : undefined;
          const waiting = svc?.peopleWaiting;
          const tone = band(zone.serviceName ? waiting : undefined);
          const isActive = !!active && (zone.serviceName === active || zone.name === active);

          return (
            <button
              key={zone.id}
              onClick={() => setSelected(selected === zone.serviceName ? null : zone.serviceName)}
              aria-label={`${zone.name}${waiting !== undefined ? `, ${waiting} waiting` : ''}`}
              aria-pressed={isActive}
              className={`absolute flex flex-col justify-between rounded-xl border p-2 text-left transition-all cursor-pointer ${tone.cls} ${
                isActive ? 'ring-2 ring-[var(--pc-primary)] scale-[1.02] z-10' : 'hover:border-[var(--pc-border-strong)]'
              }`}
              style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
            >
              <span className="flex items-start justify-between gap-1">
                <span className="truncate text-[10px] font-bold leading-tight text-[var(--pc-text)] sm:text-[11px]">
                  {zone.name}
                </span>
                <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
              </span>

              <span className="text-[9px] leading-tight text-[var(--pc-text-muted)] sm:text-[10px]">
                {zone.serviceName
                  ? (loading ? '…' : `${waiting ?? 0} waiting · ${tone.label}`)
                  : zone.note}
                {svc?.defaultCounterName ? <><br />{svc.defaultCounterName}</> : null}
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="flex items-start gap-2 rounded-xl border border-[#C7C9F0] bg-[var(--pc-tint-lilac)] px-3 py-2">
          <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pc-primary)]" />
          <p className="text-[11px] text-[var(--pc-text)]">
            <strong>{active}</strong>
            {byName.get(active)?.defaultCounterName ? ` is at ${byName.get(active)!.defaultCounterName}.` : '.'}
            {byName.get(active)?.peopleWaiting !== undefined && (
              <> {byName.get(active)!.peopleWaiting} {byName.get(active)!.peopleWaiting === 1 ? 'person is' : 'people are'} waiting there now.</>
            )}
          </p>
        </div>
      )}

      {/* Provenance, stated rather than implied. */}
      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-[var(--pc-text-subtle)]">
        <Users className="mt-0.5 h-3 w-3 shrink-0" />
        Room positions are a fixed floor plan. Queue numbers are live from the ticket
        system — they are not sensor readings and do not track individual people.
      </p>
    </div>
  );
};
