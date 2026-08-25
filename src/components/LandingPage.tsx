import React from 'react';
import {
  Activity,
  ArrowRight,
  Sparkles,
  Radar,
  SlidersHorizontal,
  CheckCircle2,
  Building2,
  HeartPulse,
  EyeOff,
  Cpu,
  Monitor,
  Smartphone,
  LayoutDashboard,
  Globe
} from 'lucide-react';
import { AppView, ViewMode } from '../types';

interface LandingPageProps {
  onLaunchApp?: (mode: ViewMode) => void;
  onLaunchKiosk?: () => void;
  onLaunchAdmin?: () => void;
  onLaunchTracker?: () => void;
  onLaunchVisitor?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onLaunchApp,
  onLaunchKiosk,
  onLaunchAdmin,
  onLaunchTracker,
  onLaunchVisitor,
}) => {
  const launch = (mode: AppView) => {
    if (mode === 'admin' && onLaunchAdmin) return onLaunchAdmin();
    if (mode === 'kiosk' && onLaunchKiosk) return onLaunchKiosk();
    if (mode === 'patient-tracker' && onLaunchTracker) return onLaunchTracker();
    if (mode === 'visitor' && onLaunchVisitor) return onLaunchVisitor();
    if (onLaunchApp) return onLaunchApp(mode);
  };

  return (
    <div className="pc min-h-screen bg-[var(--pc-page)] text-[var(--pc-text)] selection:bg-[#2E37A4] selection:text-white pb-16">

      {/* Top Banner Notice - Frosted Glass Bar */}
      <div className="bg-white/[0.04] border-b border-white/[0.10] backdrop-blur-xl px-4 py-2.5 text-center text-xs text-white/80">
        <span className="font-semibold text-white">✨ Next-Generation Healthcare Operations:</span> QueueMind AI is actively deployed across hospital networks, reducing patient wait times by 48%.
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden pt-12 pb-16 lg:pt-16 lg:pb-24">

        {/* Glow backdrop bubbles */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-[#2E37A4]/15 blur-[140px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 left-1/4 -translate-y-1/2 w-[450px] h-[300px] bg-[#00D3C7]/10 blur-[130px] pointer-events-none rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-6">

            {/* Tag pill */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.16] text-xs font-medium text-white/90 shadow-lg backdrop-blur-xl">
              <Sparkles className="w-3.5 h-3.5 text-[#2E37A4]" />
              <span>AI-Driven Spatial Intelligence & Fair Queue Optimization</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white font-display leading-[1.1]">
              Smarter Queues. <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2E37A4] via-purple-300 to-[#00D3C7]">
                Fairer Service.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed font-normal">
              QueueMind AI harnesses anonymized LiDAR and thermal matrix sensing to predict hospital bottlenecks, dynamically rebalance service counters, and ensure clinical fairness without biometric capture.
            </p>

            {/* Call to Actions (Frosted Glass Buttons) */}
            <div className="flex flex-wrap items-center justify-center gap-3.5 pt-4">
              <button
                onClick={() => launch('admin')}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#2E37A4] to-purple-600 hover:from-[#3538CD] hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-[#2E37A4]/30 flex items-center gap-2 group transition-all cursor-pointer active:scale-95 border border-white/20"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Launch Admin Operations</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => launch('kiosk')}
                className="px-6 py-3.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.16] backdrop-blur-xl text-white font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                <Monitor className="w-4 h-4 text-[#2E37A4]" />
                <span>Visitor Self-Service Kiosk</span>
              </button>

              <button
                onClick={() => launch('patient-tracker')}
                className="px-6 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] backdrop-blur-xl text-white/90 font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Smartphone className="w-4 h-4 text-[#00D3C7]" />
                <span>Live Patient Token (A-184)</span>
              </button>

              <button
                onClick={() => launch('visitor')}
                className="px-6 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] backdrop-blur-xl text-white/90 font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>Mobile Visitor App</span>
              </button>
            </div>

            {/* Live Metrics Strip - Frosted Glass Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 max-w-4xl mx-auto">

              <div className="glass-panel p-5 rounded-3xl text-left relative overflow-hidden group">
                <div className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-1">Wait Duration</div>
                <div className="text-3xl font-light text-white font-display">-48%</div>
                <div className="text-xs text-emerald-400 mt-1 font-medium flex items-center gap-1">
                  <span>↓ 18 min reduction</span>
                </div>
              </div>

              <div className="glass-panel p-5 rounded-3xl text-left relative overflow-hidden group">
                <div className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-1">Fairness Score</div>
                <div className="text-3xl font-light text-emerald-400 font-display">94/100</div>
                <div className="text-xs text-white/60 mt-1">Clinical priority SLA</div>
              </div>

              <div className="glass-panel p-5 rounded-3xl text-left relative overflow-hidden group">
                <div className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-1">Privacy Guarantee</div>
                <div className="text-3xl font-light text-[#2E37A4] font-display">100%</div>
                <div className="text-xs text-white/60 mt-1">Zero PII / Biometrics</div>
              </div>

              <div className="glass-panel p-5 rounded-3xl text-left relative overflow-hidden group">
                <div className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-1">Spatial Grid</div>
                <div className="text-3xl font-light text-[#00D3C7] font-display">42 Nodes</div>
                <div className="text-xs text-white/60 mt-1">LiDAR & Thermal mesh</div>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Trusted By Strip */}
      <div className="border-y border-white/[0.08] bg-white/[0.02] backdrop-blur-xl py-6 my-4">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs uppercase font-semibold text-white/50 tracking-wider mb-5">
            Trusted by leading healthcare networks and high-throughput triage hubs
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-80">
            <div className="flex items-center gap-2 text-white/80 font-bold text-sm tracking-wide">
              <Building2 className="w-4 h-4 text-[#2E37A4]" />
              <span>CityCare Health System</span>
            </div>
            <div className="flex items-center gap-2 text-white/80 font-bold text-sm tracking-wide">
              <HeartPulse className="w-4 h-4 text-rose-400" />
              <span>St. Jude Metro Clinic</span>
            </div>
            <div className="flex items-center gap-2 text-white/80 font-bold text-sm tracking-wide">
              <Activity className="w-4 h-4 text-teal-400" />
              <span>Northwest Regional Triage</span>
            </div>
            <div className="flex items-center gap-2 text-white/80 font-bold text-sm tracking-wide">
              <Building2 className="w-4 h-4 text-purple-400" />
              <span>Apex Specialty Hospital</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Core Lifecycle Pillars (Frosted Glass Cards) */}
      <div className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2E37A4]/15 border border-[#2E37A4]/30 text-xs font-semibold text-[#2E37A4] mb-3">
            <span>THE CLOSED-LOOP ENGINE</span>
          </div>
          <h3 className="text-3xl font-bold text-white font-display">How QueueMind AI Works</h3>
          <p className="text-white/60 text-sm mt-2">
            A continuous optimization loop from anonymous photon spatial sensing to real-time counter reallocation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

          {/* Step 1 */}
          <div className="glass-panel p-6 rounded-3xl relative group hover:border-[#2E37A4]/50 transition-all">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center mb-4 shadow-inner">
              <Radar className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1 font-mono">01. SENSE</div>
            <h4 className="text-lg font-bold text-white mb-2">LiDAR & Thermal</h4>
            <p className="text-xs text-white/65 leading-relaxed">
              Discrete ceiling-mounted sensors track room density and crowd movement vectors without capturing faces or personal identifiers.
            </p>
          </div>

          {/* Step 2 */}
          <div className="glass-panel p-6 rounded-3xl relative group hover:border-[#2E37A4]/50 transition-all">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center mb-4 shadow-inner">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1 font-mono">02. PREDICT</div>
            <h4 className="text-lg font-bold text-white mb-2">AI Inflow Forecast</h4>
            <p className="text-xs text-white/65 leading-relaxed">
              Neural models calculate wait times and forecast arrival surges 15 to 60 minutes before bottlenecks form.
            </p>
          </div>

          {/* Step 3 */}
          <div className="glass-panel p-6 rounded-3xl relative group hover:border-[#2E37A4]/50 transition-all">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center mb-4 shadow-inner">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-1 font-mono">03. OPTIMIZE</div>
            <h4 className="text-lg font-bold text-white mb-2">Dynamic Rebalance</h4>
            <p className="text-xs text-white/65 leading-relaxed">
              Underutilized counters are dynamically shifted to overloaded queues with clinical fairness protections for elderly & pediatric cases.
            </p>
          </div>

          {/* Step 4 */}
          <div className="glass-panel p-6 rounded-3xl relative group hover:border-[#2E37A4]/50 transition-all">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-300 flex items-center justify-center mb-4 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-teal-300 uppercase tracking-wider mb-1 font-mono">04. INFORM</div>
            <h4 className="text-lg font-bold text-white mb-2">Visitor Kiosks & Live SMS</h4>
            <p className="text-xs text-white/65 leading-relaxed">
              Patients receive accurate wait times and "approaching turn" alerts so they don't have to stay stuck in crowded waiting rooms.
            </p>
          </div>

        </div>
      </div>

      {/* Privacy-First Commitment (Frosted Glass Panel) */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mb-12">
        <div className="glass-hero p-8 sm:p-10 rounded-3xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
            <EyeOff className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-white font-display">100% Privacy by Design</h3>
          <p className="text-sm text-white/75 max-w-2xl mx-auto leading-relaxed">
            QueueMind AI operates strictly on spatial point-clouds and thermal silhouettes. We never record facial features, biometrics, or personal health records in sensory matrices.
          </p>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-8 pt-4 text-xs text-white font-medium">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/15">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>HIPAA Compliant</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/15">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Zero Biometric Storage</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/15">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Verifiable Decision Logs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 pt-8 border-t border-white/[0.08] text-center text-xs text-white/50">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2E37A4]" />
            <span className="font-semibold text-white/80">QueueMind AI</span>
            <span>— Frosted Glass Edition</span>
          </div>
          <div>
            <span>CityCare Health Network • Real-Time Spatial Sensing</span>
          </div>
        </div>
      </footer>

    </div>
  );
};
