import React, { useEffect, useState } from 'react';
import {
  Building2,
  Clock,
  Users,
  Stethoscope,
  FileText,
  CreditCard,
  Pill,
  CalendarCheck,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Printer,
  ArrowRight,
  Heart,
  ArrowLeft
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ServiceType, DemographicType, Token } from '../types';
import { visitorApi } from '../services/queueApi';
import { kioskText, KIOSK_LANGUAGES, KIOSK_SERVICE_TILES, KIOSK_BADGES, type KioskLanguage } from '../i18n/kiosk';
import type { VisitorServiceOption } from './VisitorFlow';

interface VisitorKioskProps {
  /** When a visitor is signed in, their details pre-fill the form. */
  user?: { name?: string; phone?: string | null } | null;
  onTokenGenerated?: (token: Token) => void;
  onIssueToken?: (token: Token) => void;
  onBackToHome?: () => void;
  onViewToken?: (token: Token) => void;
}

export const VisitorKiosk: React.FC<VisitorKioskProps> = ({
  user = null,
  onTokenGenerated,
  onIssueToken,
  onBackToHome,
  onViewToken,
}) => {
  const [selectedService, setSelectedService] = useState<ServiceType>('General Consultation');
  const [demographic, setDemographic] = useState<DemographicType>('Standard');
  const [patientName, setPatientName] = useState('');
  const [language, setLanguage] = useState<KioskLanguage>('en');
  const [phone, setPhone] = useState('');
  const t = kioskText(language);
  const [issuedToken, setIssuedToken] = useState<Token | null>(null);
  const [facilityServices, setFacilityServices] = useState<VisitorServiceOption[]>([]);
  const [isIssuing, setIsIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  // A signed-in visitor should not retype what the account already knows.
  useEffect(() => {
    if (!user) return;
    setPatientName((current) => current || user.name || '');
    setPhone((current) => current || user.phone || '');
  }, [user]);

  // The kiosk issues real queue tokens, so it needs the facility's actual
  // service records — its own tiles are only the multilingual presentation.
  useEffect(() => {
    visitorApi.getServices()
      .then(setFacilityServices)
      .catch(() => setFacilityServices([]));
  }, []);

  /** Map a kiosk tile onto a facility service, tolerating wording differences. */
  const resolveServiceId = (label: ServiceType): string | undefined => {
    if (facilityServices.length === 0) return undefined;
    const wanted = label.toLowerCase();
    const exact = facilityServices.find((service) => service.name.toLowerCase() === wanted);
    if (exact) return exact.id;
    const partial = facilityServices.find((service) => {
      const name = service.name.toLowerCase();
      return wanted.startsWith(name) || name.startsWith(wanted.split(' ')[0]);
    });
    if (partial) return partial.id;
    const fallback = facilityServices.find((service) => service.name.toLowerCase().includes('other'));
    return (fallback ?? facilityServices[0]).id;
  };

  // Icons stay here because they are React references; everything readable
  // comes from the translated catalogue in src/i18n/kiosk.ts.
  const SERVICE_ICONS: Record<string, React.FC<{ className?: string }>> = {
    'General Consultation': Stethoscope,
    'Registration': FileText,
    'Billing & Discharge': CreditCard,
    'Pharmacy & Dispensing': Pill,
    'Specialist Appointments': CalendarCheck,
    'Emergency Triage': AlertCircle,
  };

  const BADGE_TONES: Record<string, string> = {
    'zero-wait': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    'high-load': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'immediate': 'bg-rose-500/20 text-rose-300 border-rose-500/30 font-bold',
  };

  const services = KIOSK_SERVICE_TILES.map((tile) => {
    // Join each tile to its real facility service so the wait and queue length
    // shown are the live ones. The catalogue no longer carries numbers — a tile
    // quoting "24 ahead" on an empty queue was actively misleading.
    const live = facilityServices.find((service) => service.id === resolveServiceId(tile.type as ServiceType));
    return {
      type: tile.type as ServiceType,
      icon: SERVICE_ICONS[tile.type] ?? Stethoscope,
      title: tile.title[language],
      description: tile.description[language],
      waitMin: live?.estimatedWaitMinutes ?? null,
      peopleWaiting: live?.peopleWaiting ?? null,
      badge: tile.badge ? KIOSK_BADGES[tile.badge][language] : undefined,
      badgeColor: tile.badge ? BADGE_TONES[tile.badge] : undefined,
    };
  });

  /**
   * Issue a real queue token.
   *
   * The kiosk used to fabricate a code in memory, which is why kiosk tokens
   * never appeared in the Live Patient Tracker: the tracker reads the facility
   * queue from the API. The token is now created server-side, so the code,
   * queue position and wait estimate are the real ones and every screen sees it.
   */
  const handleGenerateToken = async () => {
    if (isIssuing) return;
    setIssueError(null);

    const serviceId = resolveServiceId(selectedService);
    if (!serviceId) {
      setIssueError('The facility service list is still loading. Please try again in a moment.');
      return;
    }

    setIsIssuing(true);
    try {
      const created = await visitorApi.createToken({
        serviceId,
        name: patientName.trim() || undefined,
        phone: phone.trim(),
      });

      const selectedServiceMeta = services.find(s => s.type === selectedService);
      const newToken: Token = {
        id: created.id,
        code: created.code,
        service: selectedService,
        priority: selectedService === 'Emergency Triage' ? 'Emergency' : (demographic !== 'Standard' ? 'Priority' : 'Normal'),
        demographic,
        patientName: patientName.trim() || `Patient ${created.code}`,
        issueTime: created.issuedAt
          ? new Date(created.issuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        estWaitMin: created.estimatedWaitMinutes ?? selectedServiceMeta?.waitMin ?? 0,
        peopleAhead: created.peopleAhead ?? 0,
        counterId: created.counterName || (selectedService === 'Pharmacy & Dispensing' ? 'Counter 03' : 'Counter 04'),
        status: (created.status?.toLowerCase() as Token['status']) || 'waiting',
        urgencyScore: selectedService === 'Emergency Triage' ? 99 : (demographic !== 'Standard' ? 85 : 60),
        fairnessAdjustment: demographic !== 'Standard' ? 3 : 0,
        checkInMethod: 'Kiosk',
      };

      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#8e7dff', '#ff7db8', '#4ade80']
        });
      } catch {
        // ignore
      }

      // Show the printed-ticket screen and stay on it. `onTokenGenerated`
      // navigates away, so it belongs to the "Track on mobile" button — calling
      // it here meant the ticket was replaced before anyone could read it.
      setIssuedToken(newToken);
      if (onIssueToken) onIssueToken(newToken);
    } catch (err: any) {
      setIssueError(err?.message || 'That token could not be issued. Please ask a staff member for help.');
    } finally {
      setIsIssuing(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] p-3 sm:p-6 lg:p-8 flex flex-col justify-between text-white">

      {/* Kiosk Container (Frosted Glass Shell) */}
      <div className="max-w-5xl mx-auto w-full glass-panel-elevated rounded-3xl overflow-hidden shadow-2xl">

        {/* Kiosk Header
            Compact on a phone: the identity block and the language pills share
            one row instead of stacking, and the decorative tagline steps aside.
            Every control is still here — this is the same header, tightened. */}
        <div className="bg-white/[0.05] border-b border-white/[0.12] p-4 sm:p-7 flex items-center justify-between gap-3 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            {onBackToHome && (
              <button
                onClick={onBackToHome}
                className="p-2 sm:p-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.14] text-white transition-all cursor-pointer shrink-0"
                title={t.backToOverview}
                aria-label={t.backToOverview}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-[#8e7dff] to-[#ff7db8] flex items-center justify-center text-white shadow-lg shadow-[#8e7dff]/25 border border-white/20 shrink-0">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-2xl font-display text-white truncate">{t.facilityName}</span>
                <span className="hidden xs:inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md shrink-0">
                  {t.kioskBadge}
                </span>
              </div>
              <p className="hidden sm:block text-xs text-white/60 mt-0.5">
                {t.tagline}
              </p>
            </div>
          </div>

          {/* Language Switcher (Frosted Glass Pills) */}
          <div className="flex items-center bg-white/[0.06] border border-white/[0.12] rounded-2xl p-0.5 sm:p-1 text-xs backdrop-blur-md shrink-0">
            {KIOSK_LANGUAGES.map((option) => (
              <button
                key={option.id}
                onClick={() => setLanguage(option.id)}
                aria-pressed={language === option.id}
                className={`px-2 sm:px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${language === option.id ? 'bg-[#8e7dff] text-white shadow-md shadow-[#8e7dff]/30' : 'text-white/60 hover:text-white'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-8">

          {issuedToken ? (
            /* Printed Token Confirmation Card - Frosted Glass Ticket */
            <div className="max-w-md mx-auto text-center space-y-6 py-4">

              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white font-display">{t.tokenIssued}</h2>
                <p className="text-xs text-white/60 mt-1">Please take your printed slip or track live on your mobile device.</p>
              </div>

              {/* Physical Slip Mockup (Glowing Frosted Card) */}
              <div className="p-4 sm:p-6 rounded-3xl bg-white/[0.08] border border-white/20 text-left relative shadow-2xl backdrop-blur-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">CityCare Hospital</span>
                    <h3 className="text-sm font-bold text-white">{issuedToken.service}</h3>
                  </div>
                  <Printer className="w-5 h-5 text-white/50" />
                </div>

                <div className="py-6 text-center">
                  <span className="text-xs text-white/60 font-medium">{t.yourTokenNumber}</span>
                  <div className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#8e7dff] to-[#ff7db8] font-mono tracking-tight my-2">
                    {issuedToken.code}
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#8e7dff]/20 text-[#8e7dff] border border-[#8e7dff]/40 mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Est. Wait: ~{issuedToken.estWaitMin} mins</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10 text-xs">
                  <div>
                    <span className="text-white/50 text-[10px] block">{t.peopleAhead}</span>
                    <span className="font-bold text-white">{issuedToken.peopleAhead} visitors</span>
                  </div>
                  <div>
                    <span className="text-white/50 text-[10px] block">{t.assignedCounter}</span>
                    <span className="font-bold text-[#8e7dff]">{issuedToken.counterId}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    if (onViewToken) onViewToken(issuedToken);
                    if (onTokenGenerated) onTokenGenerated(issuedToken);
                  }}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-purple-600 hover:from-[#7b69fd] hover:to-purple-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#8e7dff]/30 cursor-pointer active:scale-98 transition-all border border-white/20"
                >
                  <span>{t.trackOnMobile}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIssuedToken(null)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.14] text-white font-semibold text-sm transition-all cursor-pointer"
                >
                  <span>{t.issueAnother}</span>
                </button>
              </div>

            </div>
          ) : (
            /* Service Selection Grid */
            <div className="space-y-6">

              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white font-display">
                    {t.stepService}
                  </h2>
                  <p className="text-xs text-white/60">
                    {t.stepServiceHint}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.10] text-xs text-white/70 font-medium backdrop-blur-md">
                  <Clock className="w-3.5 h-3.5 text-[#8e7dff]" />
                  <span>{t.avgWait}</span>
                </div>
              </div>

              {/* Service Cards Grid (Frosted Glass Interactive Cards)
                  Two per row on a phone. Full-width cards meant six services
                  filled roughly two screens of scrolling before the visitor
                  could reach the button that acts on their choice; paired up,
                  the whole list is visible at once. The description is the one
                  thing that steps aside at this size — the title, the icon, the
                  live wait and the queue count all stay. */}
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
                {services.map((s) => {
                  const Icon = s.icon;
                  const isSelected = selectedService === s.type;
                  return (
                    <button
                      key={s.type}
                      onClick={() => setSelectedService(s.type)}
                      aria-pressed={isSelected}
                      className={`p-3.5 sm:p-5 rounded-3xl text-left transition-all flex flex-col justify-between relative group cursor-pointer ${isSelected
                        ? 'bg-[#8e7dff]/20 border-2 border-[#8e7dff] shadow-[0_0_25px_rgba(142,125,255,0.3)] backdrop-blur-2xl'
                        : 'glass-panel-interactive border border-white/[0.12] hover:border-white/[0.25]'
                        }`}
                    >
                      {/* Badge if any */}
                      {s.badge && (
                        <span className={`absolute top-3 right-3 sm:top-4 sm:right-4 px-2 py-0.5 rounded-full text-[10px] font-semibold border backdrop-blur-md ${s.badgeColor}`}>
                          {s.badge}
                        </span>
                      )}

                      <div className="space-y-2 sm:space-y-3">
                        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center ${isSelected
                          ? 'bg-[#8e7dff] text-white shadow-md shadow-[#8e7dff]/40'
                          : 'bg-white/[0.08] text-white/80 group-hover:bg-[#8e7dff]/20 group-hover:text-[#8e7dff]'
                          } transition-colors border border-white/10`}>
                          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm sm:text-base leading-snug">{s.title}</h3>
                          <p className="hidden sm:block text-xs text-white/60 mt-1 line-clamp-2">{s.description}</p>
                        </div>
                      </div>

                      {/* Wait & Queue Metrics footer */}
                      <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-white/[0.10] flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] sm:text-xs">
                        <div className="flex items-center gap-1 font-semibold text-white/90">
                          <Clock className="w-3.5 h-3.5 text-[#8e7dff] shrink-0" />
                          <span>
                            {s.waitMin === null ? '—' : s.waitMin === 0 ? t.noWait : `~${s.waitMin} ${t.minWait}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-white/60">
                          <Users className="w-3.5 h-3.5 text-white/40 shrink-0" />
                          <span>{s.peopleWaiting === null ? '—' : `${s.peopleWaiting} ${t.peopleWaiting}`}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Priority Demographics Bar (Fairness Assistance) */}
              <div className="p-3.5 sm:p-5 rounded-3xl bg-white/[0.05] border border-white/[0.12] backdrop-blur-xl space-y-2.5 sm:space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-[#ff7db8] shrink-0" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white/80">
                      {t.stepAssistance}
                    </h4>
                  </div>
                  <span className="text-[11px] text-white/50">{t.fairnessNote}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {(['Standard', 'Elderly', 'Pediatric', 'Pregnant / Mobility'] as DemographicType[]).map((type) => {
                    const demo = { type, ...t.demographics[type] };
                    return (
                    <button
                      key={demo.type}
                      type="button"
                      onClick={() => setDemographic(demo.type)}
                      aria-pressed={demographic === demo.type}
                      className={`p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer ${demographic === demo.type
                        ? 'border-[#8e7dff] bg-[#8e7dff]/25 font-semibold text-white shadow-[0_0_15px_rgba(142,125,255,0.25)]'
                        : 'border-white/[0.10] bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'
                        }`}
                    >
                      <div className="font-semibold text-xs text-white leading-snug">{demo.label}</div>
                      {/* The qualifier is guidance, not a control: it makes each
                          tile a three-line block on a phone, so it waits for a
                          wider screen. The label alone still says what it is. */}
                      <div className="hidden sm:block text-[10px] text-white/50 mt-0.5">{demo.desc}</div>
                    </button>
                    );
                  })}
                </div>
              </div>

              {/* Patient Name / Optional Contact & Button */}
              <div className="flex flex-col lg:flex-row gap-4 lg:items-end justify-between pt-2">
                <div className="w-full lg:max-w-xl">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">{t.stepDetails}</span>
                    {user && <span className="text-[10px] text-emerald-300">{t.signedInNote}</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder={t.namePlaceholder}
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="w-full px-4 py-3 text-xs glass-input rounded-2xl placeholder-white/40 text-white"
                    />
                    <input
                      type="tel"
                      placeholder={t.phonePlaceholder}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-3 text-xs glass-input rounded-2xl placeholder-white/40 text-white"
                    />
                  </div>
                </div>

                {issueError && (
                  <div className="w-full flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{issueError}</span>
                  </div>
                )}

                {/* Print Token Action */}
                <button
                  onClick={handleGenerateToken}
                  disabled={isIssuing}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-[#8e7dff] via-purple-600 to-[#ff7db8] hover:opacity-90 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-[#8e7dff]/30 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer border border-white/20"
                >
                  <Printer className="w-5 h-5" />
                  <span>{isIssuing ? t.issuing : t.getToken}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Anonymous Sensing Trust Footer */}
        <div className="bg-white/[0.03] border-t border-white/[0.08] px-4 sm:px-6 py-3 sm:py-3.5 flex flex-col sm:flex-row items-center justify-between text-[11px] sm:text-xs text-white/60 gap-1.5 sm:gap-2 backdrop-blur-md text-center sm:text-left">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            {/* The full recital runs to three lines on a phone. The short form
                makes the same promise; the detail returns with the room. */}
            <span className="sm:hidden">Anonymous sensing • No facial recognition</span>
            <span className="hidden sm:inline">Anonymous Spatial Sensing Active • Zero Facial Recognition • HIPAA Compliant</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
            <span>{t.syncNote}</span>
          </div>
        </div>

      </div>

      {/* Bottom helper prompt */}
      <div className="text-center text-xs text-white/50 mt-4">
        Need emergency care immediately? Alert any staff member or proceed directly to Counter 07 (Emergency Triage).
      </div>

    </div>
  );
};
