import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react';

/**
 * Public, deliberately minimal queue data. Keep clinical notes and unmasked
 * contact details out of this DTO: the visitor route only needs what it can
 * safely render back to the token holder.
 */
export interface PublicQueueToken {
  id: string;
  code: string;
  serviceName: string;
  peopleAhead: number;
  estimatedWaitMinutes: number;
  status: 'Waiting' | 'Approaching' | 'Serving' | 'Completed' | 'Cancelled';
  counterName?: string | null;
  issuedAt?: string;
}

export interface VisitorServiceOption {
  id: string;
  name: string;
  description?: string;
  estimatedWaitMinutes?: number;
  peopleWaiting?: number;
}

export interface WalkInTokenRequest {
  serviceId: string;
  name?: string;
  phone?: string;
}

export interface VisitorStartProps {
  facilityName?: string;
  onStartWalkIn: () => void;
  onStartAppointment: () => void;
  onFindToken?: () => void;
}

export interface WalkInTokenFlowProps {
  /** Service data should come from the facility API when available. */
  services?: VisitorServiceOption[];
  facilityName?: string;
  /** A token retrieved from the server after a visitor reopens their link. */
  initialToken?: PublicQueueToken | null;
  /** The server owns token allocation; this callback must return its result. */
  onCreateToken: (request: WalkInTokenRequest) => Promise<PublicQueueToken> | PublicQueueToken;
  /** Optional live/polling bridge owned by the route or realtime service. */
  onRefreshToken?: (tokenId: string) => Promise<PublicQueueToken> | PublicQueueToken;
  onTokenCreated?: (token: PublicQueueToken) => void;
  onBack?: () => void;
  onBookAppointment?: () => void;
}

const DEFAULT_SERVICES: VisitorServiceOption[] = [
  {
    id: 'general-consultation',
    name: 'General Consultation',
    description: 'General health concerns and triage',
    estimatedWaitMinutes: 12,
    peopleWaiting: 7,
  },
  {
    id: 'registration',
    name: 'Registration',
    description: 'New patient registration and records',
    estimatedWaitMinutes: 5,
    peopleWaiting: 2,
  },
  {
    id: 'billing',
    name: 'Billing',
    description: 'Payments, insurance, and discharge billing',
    estimatedWaitMinutes: 8,
    peopleWaiting: 4,
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy',
    description: 'Prescription collection and medicines',
    estimatedWaitMinutes: 18,
    peopleWaiting: 11,
  },
  {
    id: 'diagnostics',
    name: 'Diagnostics',
    description: 'Lab tests, scans, and sample collection',
    estimatedWaitMinutes: 15,
    peopleWaiting: 8,
  },
];

const statusTone: Record<PublicQueueToken['status'], string> = {
  Waiting: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
  Approaching: 'bg-[#8e7dff]/20 text-purple-100 border-[#8e7dff]/40',
  Serving: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  Completed: 'bg-white/[0.07] text-white/70 border-white/[0.12]',
  Cancelled: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
};

const statusMessage: Record<PublicQueueToken['status'], string> = {
  Waiting: 'You are in the queue. We will keep this page up to date.',
  Approaching: 'Your turn is approaching. Please make your way to the waiting area.',
  Serving: 'Please proceed to your assigned counter.',
  Completed: 'This token has been completed. Thank you for visiting.',
  Cancelled: 'This token is no longer active. Please contact the facility if you need help.',
};

const metricNumber = (value: number, fallback = 0) => Number.isFinite(value) ? Math.max(0, value) : fallback;

/**
 * The first screen a QR visitor sees. It keeps the two journeys distinct:
 * a lightweight walk-in token and a pre-booked doctor appointment.
 */
export const VisitorStart: React.FC<VisitorStartProps> = ({
  facilityName = 'QueueMind AI',
  onStartWalkIn,
  onStartAppointment,
  onFindToken,
}) => (
  <main className="min-h-[calc(100vh-4rem)] px-4 py-7 sm:px-6 sm:py-10 text-white">
    <div className="mx-auto w-full max-w-lg space-y-5">
      <header className="px-1 text-center sm:text-left">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-tr from-[#8e7dff] to-[#ff7db8] shadow-lg shadow-[#8e7dff]/25 sm:mx-0">
          <Building2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#b9b0ff]">Welcome to {facilityName}</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white">How can we help today?</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/65">Choose a quick walk-in token or reserve a time with a doctor.</p>
      </header>

      <section className="space-y-3" aria-label="Visitor options">
        <button
          type="button"
          onClick={onStartWalkIn}
          className="glass-panel-interactive w-full rounded-3xl p-5 text-left shadow-xl cursor-pointer"
        >
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#8e7dff]/35 bg-[#8e7dff]/20 text-[#c5beff]">
            <Ticket className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex items-start justify-between gap-4">
            <span>
              <span className="block font-display text-lg font-bold text-white">Get a walk-in token</span>
              <span className="mt-1 block text-xs leading-relaxed text-white/60">Select a service and receive a live queue position. No account needed.</span>
            </span>
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[#b9b0ff]" aria-hidden="true" />
          </span>
        </button>

        <button
          type="button"
          onClick={onStartAppointment}
          className="glass-panel-interactive w-full rounded-3xl p-5 text-left shadow-xl cursor-pointer"
        >
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex items-start justify-between gap-4">
            <span>
              <span className="block font-display text-lg font-bold text-white">Book a doctor appointment</span>
              <span className="mt-1 block text-xs leading-relaxed text-white/60">Choose a doctor, date, and available consultation time.</span>
            </span>
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
          </span>
        </button>
      </section>

      {onFindToken && (
        <button
          type="button"
          onClick={onFindToken}
          className="mx-auto flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white/65 hover:text-white cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5 text-[#b9b0ff]" aria-hidden="true" />
          Open an existing token or appointment
        </button>
      )}

      <p className="flex items-start justify-center gap-2 px-4 text-center text-[11px] leading-relaxed text-white/45">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
        Your details are used only for this visit and optional queue notifications.
      </p>
    </div>
  </main>
);

/**
 * Mobile-first QR walk-in flow. It never makes up a token number; allocation
 * is delegated to `onCreateToken`, which is expected to call the server.
 */
export const WalkInTokenFlow: React.FC<WalkInTokenFlowProps> = ({
  services = DEFAULT_SERVICES,
  facilityName = 'QueueMind AI',
  initialToken = null,
  onCreateToken,
  onRefreshToken,
  onTokenCreated,
  onBack,
  onBookAppointment,
}) => {
  const [step, setStep] = useState<'service' | 'details' | 'token'>(initialToken ? 'token' : 'service');
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState<PublicQueueToken | null>(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (initialToken) {
      setToken(initialToken);
      setStep('token');
    }
  }, [initialToken]);

  useEffect(() => {
    if (!selectedServiceId && services[0]) setSelectedServiceId(services[0].id);
  }, [selectedServiceId, services]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId),
    [selectedServiceId, services],
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedServiceId || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const createdToken = await onCreateToken({
        serviceId: selectedServiceId,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setToken(createdToken);
      setStep('token');
      onTokenCreated?.(createdToken);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'We could not issue your token. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshToken = async () => {
    if (!token || !onRefreshToken || isRefreshing) return;
    setError(null);
    setIsRefreshing(true);
    try {
      setToken(await onRefreshToken(token.id));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'We could not refresh your queue status. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const startAnotherToken = () => {
    setToken(null);
    setName('');
    setPhone('');
    setError(null);
    setStep('service');
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] px-4 py-5 sm:px-6 sm:py-8 text-white">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-[28px] glass-panel-elevated shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.12] bg-white/[0.035] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {onBack && step !== 'token' && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-white/[0.13] bg-white/[0.06] p-2 text-white/75 hover:bg-white/[0.13] hover:text-white cursor-pointer"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#8e7dff] to-[#ff7db8] shadow-lg shadow-[#8e7dff]/20">
              <Ticket className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-white">{facilityName}</p>
              <p className="text-[11px] text-white/55">Walk-in queue</p>
            </div>
          </div>
          <span className="rounded-full border border-[#8e7dff]/30 bg-[#8e7dff]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#d6d2ff]">QR visit</span>
        </header>

        {step !== 'token' && (
          <div className="border-b border-white/[0.10] px-5 py-3 sm:px-6">
            <ol className="grid grid-cols-2 gap-2 text-[10px] font-semibold uppercase tracking-wide" aria-label="Walk-in progress">
              <li className={step === 'service' ? 'text-[#c5beff]' : 'text-white/45'}>1. Service</li>
              <li className={step === 'details' ? 'text-[#c5beff]' : 'text-white/45'}>2. Your details</li>
            </ol>
          </div>
        )}

        <div className="p-5 sm:p-6">
          {step === 'service' && (
            <section aria-labelledby="walk-in-service-title">
              <div className="mb-5">
                <h1 id="walk-in-service-title" className="font-display text-2xl font-bold tracking-tight text-white">Select a service</h1>
                <p className="mt-1 text-xs leading-relaxed text-white/60">You can get a token without creating an account.</p>
              </div>

              <div className="space-y-2.5">
                {services.map((service) => {
                  const isSelected = service.id === selectedServiceId;
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => setSelectedServiceId(service.id)}
                      className={`w-full rounded-2xl border p-4 text-left cursor-pointer ${
                        isSelected
                          ? 'border-[#8e7dff]/55 bg-[#8e7dff]/18 shadow-[0_8px_20px_rgba(142,125,255,0.13)]'
                          : 'border-white/[0.10] bg-white/[0.035] hover:border-white/[0.22] hover:bg-white/[0.07]'
                      }`}
                      aria-pressed={isSelected}
                    >
                      <span className="flex items-start justify-between gap-4">
                        <span>
                          <span className="block text-sm font-bold text-white">{service.name}</span>
                          {service.description && <span className="mt-1 block text-[11px] leading-relaxed text-white/55">{service.description}</span>}
                        </span>
                        {isSelected && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#bdb5ff]" aria-hidden="true" />}
                      </span>
                      <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-white/55">
                        {typeof service.estimatedWaitMinutes === 'number' && (
                          <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />~{service.estimatedWaitMinutes} min</span>
                        )}
                        {typeof service.peopleWaiting === 'number' && (
                          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-[#bdb5ff]" aria-hidden="true" />{service.peopleWaiting} waiting</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setStep('details')}
                disabled={!selectedServiceId}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#4F46E5]/25 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </section>
          )}

          {step === 'details' && (
            <form onSubmit={submit} noValidate aria-labelledby="walk-in-details-title">
              <button
                type="button"
                onClick={() => setStep('service')}
                className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-white/55 hover:text-white cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Change service
              </button>
              <h1 id="walk-in-details-title" className="font-display text-2xl font-bold tracking-tight text-white">A few optional details</h1>
              <p className="mt-1 text-xs leading-relaxed text-white/60">Your token is for <span className="font-semibold text-white">{selectedService?.name ?? 'your selected service'}</span>. We only use a phone number for queue updates.</p>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-white/80"><UserRound className="h-3.5 w-3.5 text-[#bdb5ff]" aria-hidden="true" />Name <span className="font-normal text-white/40">(optional)</span></span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    maxLength={100}
                    placeholder="How should we address you?"
                    className="glass-input w-full rounded-2xl px-4 py-3 text-sm placeholder:text-white/35"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-white/80"><Phone className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />Phone number <span className="font-normal text-white/40">(optional)</span></span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={30}
                    placeholder="For queue notifications"
                    className="glass-input w-full rounded-2xl px-4 py-3 text-sm placeholder:text-white/35"
                  />
                </label>
              </div>

              {error && <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3 py-2.5 text-xs leading-relaxed text-rose-100" role="alert">{error}</p>}

              <p className="mt-4 flex gap-2 text-[11px] leading-relaxed text-white/48"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />A unique token is securely allocated by the facility. You cannot choose a token number.</p>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#4F46E5]/25 disabled:cursor-wait disabled:opacity-70 cursor-pointer"
              >
                {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Ticket className="h-4 w-4" aria-hidden="true" />}
                {isSubmitting ? 'Generating token…' : 'Generate token'}
              </button>
            </form>
          )}

          {step === 'token' && token && (
            <section className="space-y-4" aria-labelledby="token-result-title" aria-live="polite">
              <div className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/15 text-emerald-300 shadow-lg shadow-emerald-500/10"><CheckCircle2 className="h-7 w-7" aria-hidden="true" /></span>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">Your token</p>
                <h1 id="token-result-title" className="mt-1 font-mono text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-[#d8d4ff] to-[#ffb5d4]">{token.code}</h1>
                <p className="mt-2 text-xs text-white/60">{token.serviceName}</p>
              </div>

              <div className="rounded-3xl border border-[#8e7dff]/35 bg-[#8e7dff]/12 p-4 text-center">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone[token.status]}`}>{token.status}</span>
                <p className="mt-2 text-xs leading-relaxed text-white/70">{statusMessage[token.status]}</p>
              </div>

              <dl className="grid grid-cols-2 gap-2.5">
                <TokenMetric icon={<Users className="h-4 w-4 text-[#bdb5ff]" />} label="People ahead" value={`${metricNumber(token.peopleAhead)}`} />
                <TokenMetric icon={<Clock3 className="h-4 w-4 text-amber-300" />} label="Estimated wait" value={`${metricNumber(token.estimatedWaitMinutes)} min`} />
                <TokenMetric icon={<Building2 className="h-4 w-4 text-emerald-300" />} label="Counter" value={token.counterName || 'Not assigned'} wide />
              </dl>

              {error && <p className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3 py-2.5 text-xs leading-relaxed text-rose-100" role="alert">{error}</p>}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={refreshToken}
                  disabled={!onRefreshToken || isRefreshing}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.14] bg-white/[0.07] px-4 py-3 text-xs font-bold text-white hover:bg-white/[0.13] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-[#bdb5ff] ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {isRefreshing ? 'Refreshing…' : 'Refresh status'}
                </button>
                {onBookAppointment ? (
                  <button type="button" onClick={onBookAppointment} className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] px-4 py-3 text-xs font-bold text-white shadow-lg shadow-[#4F46E5]/20 cursor-pointer">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    Book doctor visit
                  </button>
                ) : (
                  <button type="button" onClick={startAnotherToken} className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] px-4 py-3 text-xs font-bold text-white shadow-lg shadow-[#4F46E5]/20 cursor-pointer">
                    <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
                    New token
                  </button>
                )}
              </div>
              <p className="px-2 text-center text-[10px] leading-relaxed text-white/42">Keep this page or your private token link open to follow live queue updates.</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
};

const TokenMetric: React.FC<{ icon: React.ReactNode; label: string; value: string; wide?: boolean }> = ({ icon, label, value, wide }) => (
  <div className={`rounded-2xl border border-white/[0.10] bg-white/[0.045] p-3.5 ${wide ? 'col-span-2' : ''}`}>
    <dt className="flex items-center gap-1.5 text-[10px] font-medium text-white/52">{icon}{label}</dt>
    <dd className="mt-1.5 truncate font-display text-sm font-bold text-white">{value}</dd>
  </div>
);

