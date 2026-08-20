import React, { useState } from 'react';
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

interface VisitorKioskProps {
  onTokenGenerated?: (token: Token) => void;
  onIssueToken?: (token: Token) => void;
  onBackToHome?: () => void;
  onViewToken?: (token: Token) => void;
}

export const VisitorKiosk: React.FC<VisitorKioskProps> = ({
  onTokenGenerated,
  onIssueToken,
  onBackToHome,
  onViewToken,
}) => {
  const [selectedService, setSelectedService] = useState<ServiceType>('General Consultation');
  const [demographic, setDemographic] = useState<DemographicType>('Standard');
  const [patientName, setPatientName] = useState('');
  const [language, setLanguage] = useState<'en' | 'hi' | 'or'>('en');
  const [issuedToken, setIssuedToken] = useState<Token | null>(null);

  const services: { 
    type: ServiceType; 
    icon: React.FC<{ className?: string }>; 
    titleEn: string; 
    titleHi: string; 
    titleOr: string; 
    waitMin: number; 
    peopleWaiting: number; 
    badge?: string; 
    badgeColor?: string;
    description: string;
  }[] = [
    {
      type: 'General Consultation',
      icon: Stethoscope,
      titleEn: 'General Consultation',
      titleHi: 'सामान्य परामर्श',
      titleOr: 'ସାଧାରଣ ପରାମର୍ଶ',
      waitMin: 18,
      peopleWaiting: 24,
      description: 'OPD doctor checkups, seasonal illness, and general triage',
    },
    {
      type: 'Registration',
      icon: FileText,
      titleEn: 'Registration & New Patient',
      titleHi: 'पंजीकरण एवं नया रोगी',
      titleOr: 'ପଞ୍ଜୀକରଣ ଏବଂ ନୂତନ ରୋଗୀ',
      waitMin: 0,
      peopleWaiting: 0,
      badge: 'Zero Wait',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      description: 'Hospital ID creation, file lookup, and insurance intake',
    },
    {
      type: 'Billing & Discharge',
      icon: CreditCard,
      titleEn: 'Billing & Discharge',
      titleHi: 'बिलिंग एवं डिस्चार्ज',
      titleOr: 'ବିଲିଂ ଏବଂ ଡିସଚାର୍ଜ',
      waitMin: 8,
      peopleWaiting: 9,
      description: 'Cashless claims, settlement, and discharge summaries',
    },
    {
      type: 'Pharmacy & Dispensing',
      icon: Pill,
      titleEn: 'Pharmacy & Dispensing',
      titleHi: 'दवाखाना / फ़ार्मेसी',
      titleOr: 'ଔଷଧାଳୟ / ଫାର୍ମାସୀ',
      waitMin: 28,
      peopleWaiting: 35,
      badge: 'High Load',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      description: 'Prescription fulfillment and medication dispensing',
    },
    {
      type: 'Specialist Appointments',
      icon: CalendarCheck,
      titleEn: 'Specialist Appointments',
      titleHi: 'विशेषज्ञ परामर्श',
      titleOr: 'ବିଶେଷଜ୍ଞ ପରାମର୍ଶ',
      waitMin: 11,
      peopleWaiting: 8,
      description: 'Cardiology, Orthopedics, ENT, and pre-booked scans',
    },
    {
      type: 'Emergency Triage',
      icon: AlertCircle,
      titleEn: 'Emergency & Critical Care',
      titleHi: 'आपातकालीन चिकित्सा',
      titleOr: 'ଜରୁରୀକାଳୀନ ଚିକିତ୍ସା',
      waitMin: 0,
      peopleWaiting: 1,
      badge: 'Immediate',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30 font-bold',
      description: 'Direct priority intake for severe acute distress',
    },
  ];

  const handleGenerateToken = () => {
    const randomCodeNum = Math.floor(100 + Math.random() * 899);
    let prefix = 'A';
    if (selectedService === 'Pediatrics') prefix = 'P';
    if (selectedService === 'Pharmacy & Dispensing') prefix = 'RX';
    if (selectedService === 'Emergency Triage') prefix = 'E';
    if (selectedService === 'Billing & Discharge') prefix = 'B';
    if (selectedService === 'Specialist Appointments') prefix = 'S';

    const selectedServiceMeta = services.find(s => s.type === selectedService);
    const estWait = selectedService === 'Emergency Triage' ? 0 : (selectedServiceMeta?.waitMin || 15);
    const peopleAhead = selectedService === 'Emergency Triage' ? 0 : (selectedServiceMeta?.peopleWaiting || 5);

    const newToken: Token = {
      id: `t-${Date.now()}`,
      code: `${prefix}-${randomCodeNum}`,
      service: selectedService,
      priority: selectedService === 'Emergency Triage' ? 'Emergency' : (demographic !== 'Standard' ? 'Priority' : 'Normal'),
      demographic,
      patientName: patientName.trim() || `Patient ${prefix}-${randomCodeNum}`,
      issueTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      estWaitMin: estWait,
      peopleAhead,
      counterId: selectedService === 'Pharmacy & Dispensing' ? 'Counter 03' : 'Counter 04',
      status: selectedService === 'Emergency Triage' ? 'serving' : 'waiting',
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

    setIssuedToken(newToken);
    if (onTokenGenerated) onTokenGenerated(newToken);
    if (onIssueToken) onIssueToken(newToken);
  };

  const getServiceTitle = (item: typeof services[0]) => {
    if (language === 'hi') return item.titleHi;
    if (language === 'or') return item.titleOr;
    return item.titleEn;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8 flex flex-col justify-between text-white">
      
      {/* Kiosk Container (Frosted Glass Shell) */}
      <div className="max-w-5xl mx-auto w-full glass-panel-elevated rounded-3xl overflow-hidden shadow-2xl">
        
        {/* Kiosk Header */}
        <div className="bg-white/[0.05] border-b border-white/[0.12] p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            {onBackToHome && (
              <button
                onClick={onBackToHome}
                className="p-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.14] text-white transition-all cursor-pointer"
                title="Back to Overview"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#8e7dff] to-[#ff7db8] flex items-center justify-center text-white shadow-lg shadow-[#8e7dff]/25 border border-white/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xl sm:text-2xl font-display text-white">CityCare Central Hospital</span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
                  KIOSK #04
                </span>
              </div>
              <p className="text-xs text-white/60 mt-0.5">
                Touch below to select your service. AI will assign optimal counter and transparent wait time.
              </p>
            </div>
          </div>

          {/* Language Switcher (Frosted Glass Pills) */}
          <div className="flex items-center bg-white/[0.06] border border-white/[0.12] rounded-2xl p-1 text-xs backdrop-blur-md">
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                language === 'en' ? 'bg-[#8e7dff] text-white shadow-md shadow-[#8e7dff]/30' : 'text-white/60 hover:text-white'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('hi')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                language === 'hi' ? 'bg-[#8e7dff] text-white shadow-md shadow-[#8e7dff]/30' : 'text-white/60 hover:text-white'
              }`}
            >
              हिन्दी
            </button>
            <button
              onClick={() => setLanguage('or')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                language === 'or' ? 'bg-[#8e7dff] text-white shadow-md shadow-[#8e7dff]/30' : 'text-white/60 hover:text-white'
              }`}
            >
              ଓଡ଼ିଆ
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8">
          
          {issuedToken ? (
            /* Printed Token Confirmation Card - Frosted Glass Ticket */
            <div className="max-w-md mx-auto text-center space-y-6 py-4">
              
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white font-display">Token Issued Successfully!</h2>
                <p className="text-xs text-white/60 mt-1">Please take your printed slip or track live on your mobile device.</p>
              </div>

              {/* Physical Slip Mockup (Glowing Frosted Card) */}
              <div className="p-6 rounded-3xl bg-white/[0.08] border border-white/20 text-left relative shadow-2xl backdrop-blur-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">CityCare Hospital</span>
                    <h3 className="text-sm font-bold text-white">{issuedToken.service}</h3>
                  </div>
                  <Printer className="w-5 h-5 text-white/50" />
                </div>

                <div className="py-6 text-center">
                  <span className="text-xs text-white/60 font-medium">YOUR TOKEN NUMBER</span>
                  <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#8e7dff] to-[#ff7db8] font-mono tracking-tight my-2">
                    {issuedToken.code}
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#8e7dff]/20 text-[#8e7dff] border border-[#8e7dff]/40 mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Est. Wait: ~{issuedToken.estWaitMin} mins</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10 text-xs">
                  <div>
                    <span className="text-white/50 text-[10px] block">People Ahead</span>
                    <span className="font-bold text-white">{issuedToken.peopleAhead} visitors</span>
                  </div>
                  <div>
                    <span className="text-white/50 text-[10px] block">Assigned Counter</span>
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
                  <span>Track on Visitor Mobile</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIssuedToken(null)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.14] text-white font-semibold text-sm transition-all cursor-pointer"
                >
                  <span>Issue Another Token</span>
                </button>
              </div>

            </div>
          ) : (
            /* Service Selection Grid */
            <div className="space-y-6">
              
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white font-display">
                    {language === 'hi' ? 'सेवा का चयन करें' : language === 'or' ? 'ସେବା ବାଛନ୍ତୁ' : '1. Select Your Service'}
                  </h2>
                  <p className="text-xs text-white/60">
                    {language === 'hi' ? 'वर्तमान प्रतीक्षा समय वास्तविक समय में अपडेट किया जाता है।' : 'Real-time wait estimates updated by QueueMind spatial intelligence.'}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.10] text-xs text-white/70 font-medium backdrop-blur-md">
                  <Clock className="w-3.5 h-3.5 text-[#8e7dff]" />
                  <span>Avg Hospital Wait: 18 min</span>
                </div>
              </div>

              {/* Service Cards Grid (Frosted Glass Interactive Cards) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {services.map((s) => {
                  const Icon = s.icon;
                  const isSelected = selectedService === s.type;
                  return (
                    <button
                      key={s.type}
                      onClick={() => setSelectedService(s.type)}
                      className={`p-5 rounded-3xl text-left transition-all flex flex-col justify-between relative group cursor-pointer ${
                        isSelected
                          ? 'bg-[#8e7dff]/20 border-2 border-[#8e7dff] shadow-[0_0_25px_rgba(142,125,255,0.3)] backdrop-blur-2xl'
                          : 'glass-panel-interactive border border-white/[0.12] hover:border-white/[0.25]'
                      }`}
                    >
                      {/* Badge if any */}
                      {s.badge && (
                        <span className={`absolute top-4 right-4 px-2 py-0.5 rounded-full text-[10px] font-semibold border backdrop-blur-md ${s.badgeColor}`}>
                          {s.badge}
                        </span>
                      )}

                      <div className="space-y-3">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                          isSelected 
                            ? 'bg-[#8e7dff] text-white shadow-md shadow-[#8e7dff]/40' 
                            : 'bg-white/[0.08] text-white/80 group-hover:bg-[#8e7dff]/20 group-hover:text-[#8e7dff]'
                        } transition-colors border border-white/10`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-base">{getServiceTitle(s)}</h3>
                          <p className="text-xs text-white/60 mt-1 line-clamp-2">{s.description}</p>
                        </div>
                      </div>

                      {/* Wait & Queue Metrics footer */}
                      <div className="mt-4 pt-3 border-t border-white/[0.10] flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1 font-semibold text-white/90">
                          <Clock className="w-3.5 h-3.5 text-[#8e7dff]" />
                          <span>~{s.waitMin} min wait</span>
                        </div>
                        <div className="flex items-center gap-1 text-white/60">
                          <Users className="w-3.5 h-3.5 text-white/40" />
                          <span>{s.peopleWaiting} ahead</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Priority Demographics Bar (Fairness Assistance) */}
              <div className="p-5 rounded-3xl bg-white/[0.05] border border-white/[0.12] backdrop-blur-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-[#ff7db8]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white/80">
                      2. Special Assistance & Priority Care (Optional)
                    </h4>
                  </div>
                  <span className="text-[11px] text-white/50">Fairness weights applied transparently</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { type: 'Standard' as DemographicType, label: 'Standard Visitor', desc: 'Default queue' },
                    { type: 'Elderly' as DemographicType, label: 'Senior Citizen (65+)', desc: '2.0x weight adjustment' },
                    { type: 'Pediatric' as DemographicType, label: 'Pediatric (Under 6)', desc: 'Fast-track routing' },
                    { type: 'Pregnant / Mobility' as DemographicType, label: 'Pregnant / Mobility', desc: 'Seated counter priority' },
                  ].map((demo) => (
                    <button
                      key={demo.type}
                      type="button"
                      onClick={() => setDemographic(demo.type)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        demographic === demo.type
                          ? 'border-[#8e7dff] bg-[#8e7dff]/25 font-semibold text-white shadow-[0_0_15px_rgba(142,125,255,0.25)]'
                          : 'border-white/[0.10] bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <div className="font-semibold text-xs text-white">{demo.label}</div>
                      <div className="text-[10px] text-white/50 mt-0.5">{demo.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Patient Name / Optional Contact & Button */}
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-2">
                <div className="w-full sm:w-80">
                  <input
                    type="text"
                    placeholder="Patient Name (Optional)..."
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="w-full px-4 py-3 text-xs glass-input rounded-2xl placeholder-white/40 text-white"
                  />
                </div>

                {/* Print Token Action */}
                <button
                  onClick={handleGenerateToken}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-[#8e7dff] via-purple-600 to-[#ff7db8] hover:opacity-90 text-white font-bold text-sm shadow-lg shadow-[#8e7dff]/30 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer border border-white/20"
                >
                  <Printer className="w-5 h-5" />
                  <span>Get Token Ticket</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Anonymous Sensing Trust Footer */}
        <div className="bg-white/[0.03] border-t border-white/[0.08] px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between text-xs text-white/60 gap-2 backdrop-blur-md">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Anonymous Spatial Sensing Active • Zero Facial Recognition • HIPAA Compliant</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
            <span>Kiosk Synchronized with 8 Hospital Counters</span>
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
