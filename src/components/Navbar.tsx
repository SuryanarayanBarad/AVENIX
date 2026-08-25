import React, { useState } from 'react';
import {
  Activity,
  Monitor,
  Smartphone,
  LayoutDashboard,
  Globe,
  ShieldCheck,
  LogOut,
  ChevronDown,
  UserCog,
  Menu,
  X
} from 'lucide-react';
import { AppView, ViewMode, User } from '../types';

interface NavbarProps {
  currentView?: AppView | ViewMode;
  onSelectView?: (view: AppView) => void;
  onViewChange?: (view: ViewMode) => void;
  user?: User | null;
  onLoginClick?: () => void;
  onLogout?: () => void;
  onProfileClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView = 'landing',
  onSelectView,
  onViewChange,
  user = null,
  onLoginClick,
  onLogout,
  onProfileClick
}) => {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const handleNav = (v: AppView) => {
    if (onSelectView) onSelectView(v);
    if (onViewChange) onViewChange(v);
  };

  const isViewActive = (v: AppView) => {
    if (v === 'patient-tracker' && currentView === 'visitor-queue') return true;
    return currentView === v;
  };

  // The mobile sheet renders the same destinations as the desktop pills.
  const isDoctor = user?.role === 'DOCTOR';

  // A doctor works from their own dashboard, so it takes the slot the facility
  // -wide tracker occupies for everyone else rather than sitting beside it.
  const navItems: { view: AppView; label: string; icon: React.FC<{ className?: string }>; visible: boolean }[] = [
    { view: 'landing', label: 'Overview', icon: Globe, visible: true },
    { view: 'kiosk', label: 'Visitor Kiosk', icon: Monitor, visible: true },
    { view: 'doctor', label: 'Doctor Dashboard', icon: Activity, visible: isDoctor },
    { view: 'patient-tracker', label: 'Live Patient Tracker', icon: Smartphone, visible: !isDoctor },
    { view: 'admin', label: 'Command Center', icon: LayoutDashboard, visible: true },
    { view: 'super-admin', label: 'Super Admin', icon: ShieldCheck, visible: user?.role === 'SUPER_ADMIN' },
  ];

  const displayName = user ? user.name : "";
  const displayRole = user ? user.role : "";
  const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <header className="pc sticky top-0 z-40 bg-[var(--pc-surface)] border-b border-[var(--pc-border)] text-[var(--pc-text)]">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo & Facility Identity */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => handleNav('landing')}
              className="flex items-center gap-2.5 text-left group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#2E37A4] via-indigo-500 to-[#00D3C7] flex items-center justify-center text-white shadow-lg shadow-[#2E37A4]/25 border border-white/20 group-hover:scale-105 transition-transform">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-white tracking-tight font-display">
                    QueueMind<span className="text-[#2E37A4]">AI</span>
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                    LIVE SENSING
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-white/60">
                  <span className="font-medium text-white/80">CityCare Central Hospital</span>
                  <span>•</span>
                  <span>Ground & Triage</span>
                </div>
              </div>
            </button>
          </div>

          {/* View Switcher Pills - Frosted Glass Navigation */}
          <div className="hidden md:flex w-full flex-row flex-1 items-stretch bg-white/[0.06] p-1.5 rounded-2xl border border-white/[0.12] backdrop-blur-xl text-xs font-medium gap-1.5 min-w-0">

            <button
              onClick={() => handleNav('landing')}
              className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${isViewActive('landing')
                  ? 'bg-gradient-to-r from-[#2E37A4]/30 to-purple-500/30 text-white font-bold border border-[#2E37A4]/50 shadow-[0_0_15px_rgba(142,125,255,0.35)]'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
                }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="leading-tight">Overview</span>
            </button>

            <button
              onClick={() => handleNav('kiosk')}
              className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${isViewActive('kiosk')
                  ? 'bg-gradient-to-r from-[#2E37A4]/30 to-purple-500/30 text-white font-bold border border-[#2E37A4]/50 shadow-[0_0_15px_rgba(142,125,255,0.35)]'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
                }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="leading-tight">Visitor Kiosk</span>
            </button>

            {isDoctor ? (
              <button
                onClick={() => handleNav('doctor')}
                className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${isViewActive('doctor')
                    ? 'bg-gradient-to-r from-[#2E37A4]/30 to-purple-500/30 text-white font-bold border border-[#2E37A4]/50 shadow-[0_0_15px_rgba(142,125,255,0.35)]'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
                  }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span className="leading-tight">Doctor Dashboard</span>
              </button>
            ) : (
              <button
                onClick={() => handleNav('patient-tracker')}
                className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${isViewActive('patient-tracker')
                    ? 'bg-gradient-to-r from-[#2E37A4]/30 to-purple-500/30 text-white font-bold border border-[#2E37A4]/50 shadow-[0_0_15px_rgba(142,125,255,0.35)]'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
                  }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="leading-tight">Live Patient Tracker</span>
              </button>
            )}

            <button
              onClick={() => handleNav('admin')}
              className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${isViewActive('admin')
                  ? 'bg-gradient-to-r from-[#2E37A4]/30 to-purple-500/30 text-white font-bold border border-[#2E37A4]/50 shadow-[0_0_15px_rgba(142,125,255,0.35)]'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
                }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="leading-tight">Command Center</span>
            </button>

            {user?.role === 'SUPER_ADMIN' && (
              <button
                onClick={() => handleNav('super-admin')}
                className={`flex w-full min-w-0 items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-center transition-all cursor-pointer ${isViewActive('super-admin')
                    ? 'bg-gradient-to-r from-[#00D3C7]/30 to-pink-500/30 text-white font-bold border border-[#00D3C7]/50 shadow-[0_0_15px_rgba(255,125,184,0.35)]'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
                  }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="leading-tight">Super Admin</span>
              </button>
            )}

          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3">

            {/* Mobile navigation — the pill row is hidden below md */}
            <div className="relative md:hidden">
              <button
                onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
                aria-label={isMobileNavOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={isMobileNavOpen}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.07] border border-white/[0.14] text-white/80 hover:text-white hover:bg-white/[0.12] backdrop-blur-md cursor-pointer transition-colors"
              >
                {isMobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>

              {isMobileNavOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsMobileNavOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/[0.2] bg-[#12122b]/95 backdrop-blur-2xl shadow-xl z-40 overflow-hidden p-1.5 space-y-1">
                    {navItems.filter((item) => item.visible).map((item) => {
                      const Icon = item.icon;
                      const active = isViewActive(item.view);
                      return (
                        <button
                          key={item.view}
                          onClick={() => {
                            handleNav(item.view);
                            setIsMobileNavOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-left transition-all cursor-pointer ${active
                              ? 'bg-gradient-to-r from-[#2E37A4]/30 to-purple-500/30 text-white font-bold border border-[#2E37A4]/50'
                              : 'text-white/70 hover:text-white hover:bg-white/[0.08] border border-transparent'
                            }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="leading-tight truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Privacy Compliance Pill */}
            <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.12] text-[11px] text-white/80 font-medium backdrop-blur-md">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zero-PII LiDAR</span>
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              {user ? (
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.14] backdrop-blur-md cursor-pointer hover:bg-white/[0.1] transition-colors"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={displayName}
                      className="w-7 h-7 rounded-full object-cover border border-white/20 shadow-sm"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#2E37A4] to-[#00D3C7] flex items-center justify-center text-white font-bold text-[11px] shadow-sm">
                      {initials}
                    </div>
                  )}
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-semibold text-white leading-tight">{displayName}</p>
                    <p className="text-[10px] text-white/60 leading-tight">{displayRole}</p>
                  </div>
                  <ChevronDown className="w-3 h-3 text-white/60 ml-1" />
                </button>
              ) : (
                <button
                  onClick={() => onLoginClick?.()}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#2E37A4] to-purple-500 text-white font-semibold text-xs shadow-[0_0_15px_rgba(142,125,255,0.4)] hover:shadow-[0_0_20px_rgba(142,125,255,0.6)] transition-all cursor-pointer"
                >
                  Sign In
                </button>
              )}

              {user && isProfileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsProfileMenuOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-white/[0.2] bg-[#12122b]/95 backdrop-blur-2xl shadow-xl z-40 overflow-hidden py-1">
                    <button
                      onClick={() => {
                        onProfileClick?.();
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                    >
                      <UserCog className="w-4 h-4" />
                      Profile
                    </button>
                    <button
                      onClick={() => {
                        onLogout?.();
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </header>
  );
};
