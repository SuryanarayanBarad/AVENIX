import React from 'react';
import { 
  Activity, 
  Sparkles, 
  Monitor, 
  Smartphone, 
  LayoutDashboard, 
  Globe, 
  ShieldCheck,
  Ticket
} from 'lucide-react';
import { AppView, ViewMode } from '../types';

interface NavbarProps {
  currentView?: AppView | ViewMode;
  onSelectView?: (view: AppView) => void;
  onViewChange?: (view: ViewMode) => void;
  activeTokenCode?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView = 'landing',
  onSelectView,
  onViewChange,
  activeTokenCode = 'A-184',
}) => {
  const handleNav = (v: AppView) => {
    if (onSelectView) onSelectView(v);
    if (onViewChange) onViewChange(v);
  };

  const isViewActive = (v: AppView) => currentView === v;

  return (
    <header className="sticky top-0 z-40 bg-white/[0.05] backdrop-blur-2xl border-b border-white/[0.12] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Facility Identity */}
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={() => handleNav('landing')}
              className="flex items-center gap-2.5 text-left group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#8e7dff] via-indigo-500 to-[#ff7db8] flex items-center justify-center text-white shadow-lg shadow-[#8e7dff]/25 border border-white/20 group-hover:scale-105 transition-transform">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-white tracking-tight font-display">
                    QueueMind<span className="text-[#8e7dff]">AI</span>
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                    LIVE SENSING
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-white/60">
                  <span className="font-medium text-white/80">CityCare Central Hospital</span>
                  <span>•</span>
                  <span>Ground & Triage</span>
                </div>
              </div>
            </button>
          </div>

          {/* View Switcher Pills - Frosted Glass Navigation */}
          <div className="hidden md:grid w-full grid-cols-4 flex-1 items-stretch bg-white/[0.06] p-1.5 rounded-2xl border border-white/[0.12] backdrop-blur-xl text-xs font-medium gap-1.5 min-w-0">
            
            <button
              onClick={() => handleNav('landing')}
              className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${
                isViewActive('landing')
                  ? 'bg-gradient-to-r from-[#8e7dff]/30 to-purple-500/30 text-white font-bold border border-[#8e7dff]/50 shadow-[0_0_15px_rgba(142,125,255,0.35)]'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="leading-tight">Overview</span>
            </button>

            <button
              onClick={() => handleNav('kiosk')}
              className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${
                isViewActive('kiosk')
                  ? 'bg-gradient-to-r from-[#8e7dff]/30 to-purple-500/30 text-white font-bold border border-[#8e7dff]/50 shadow-[0_0_15px_rgba(142,125,255,0.35)]'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="leading-tight">Visitor Kiosk</span>
            </button>

            <button
              onClick={() => handleNav('patient-tracker')}
              className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${
                isViewActive('patient-tracker')
                  ? 'bg-gradient-to-r from-[#8e7dff]/30 to-purple-500/30 text-white font-bold border border-[#8e7dff]/50 shadow-[0_0_15px_rgba(142,125,255,0.35)]'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="leading-tight">Live Patient Tracker ({activeTokenCode})</span>
            </button>

            <button
              onClick={() => handleNav('admin')}
              className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${
                isViewActive('admin')
                  ? 'bg-gradient-to-r from-[#8e7dff]/30 to-purple-500/30 text-white font-bold border border-[#8e7dff]/50 shadow-[0_0_15px_rgba(142,125,255,0.35)]'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="leading-tight">Command Center</span>
            </button>

          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Privacy Compliance Pill */}
            <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.12] text-[11px] text-white/80 font-medium backdrop-blur-md">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zero-PII LiDAR</span>
            </div>

            {/* Admin User Pill */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.14] backdrop-blur-md">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#8e7dff] to-[#ff7db8] flex items-center justify-center text-white font-bold text-[11px] shadow-sm">
                JS
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-white leading-tight">Dr. Julian Sarah</p>
                <p className="text-[10px] text-white/60 leading-tight">Chief Ops Officer</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </header>
  );
};
