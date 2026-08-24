import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Radar, 
  TrendingUp, 
  SlidersHorizontal, 
  Calendar, 
  Scale, 
  BarChart3, 
  HelpCircle, 
  Radio,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Camera,
  Ticket,
  ClipboardCheck,
  Stethoscope,
  UserCog,
  FileText,
  UserRound
} from 'lucide-react';
import { AdminTab } from '../types';
import { visibleTabs } from '../../lib/permissions';

interface SidebarProps {
  currentTab?: AdminTab;
  activeTab?: AdminTab;
  onSelectTab?: (tab: AdminTab) => void;
  onTabChange?: (tab: AdminTab) => void;
  waitingCount?: number;
  alertCount?: number;
  /** Pending appointment requests, shown as a badge on the doctor's tab. */
  requestCount?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Drives which destinations exist at all. */
  role?: string | null;
}

interface TabMeta {
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string | number;
  badgeColor?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  activeTab,
  onSelectTab,
  onTabChange,
  waitingCount = 147,
  requestCount = 0,
  collapsed = false,
  onToggleCollapse,
  role = 'ADMIN',
}) => {
  const selectedTab = currentTab || activeTab || 'overview';
  const handleTabClick = (tab: AdminTab) => {
    if (onSelectTab) onSelectTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  // Labels and badges per destination. Which of these appear is decided by the
  // shared capability matrix, never by this component.
  const tabMeta: Record<AdminTab, TabMeta> = {
    'my-visit': { label: 'My Visit', icon: Ticket },
    'overview': { label: 'Overview', icon: LayoutDashboard },
    'live-queue': { label: 'Live Queue', icon: Users, badge: waitingCount, badgeColor: 'bg-[#8e7dff]/20 text-[#8e7dff] border border-[#8e7dff]/30' },
    'requests': {
      label: 'Requests',
      icon: ClipboardCheck,
      ...(requestCount > 0 ? { badge: requestCount, badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' } : {}),
    },
    'my-patients': { label: 'My Patients', icon: UserRound },
    'appointments': { label: 'Appointments', icon: Calendar },
    'doctor-schedule': { label: 'Doctor Schedule', icon: Calendar },
    'doctors': { label: 'Doctors', icon: Stethoscope },
    'crowd-intel': { label: 'Crowd Intelligence', icon: Radar, badge: 'Simulated', badgeColor: 'bg-white/10 text-white/60 border border-white/15' },
    'ai-predictions': { label: 'AI Predictions', icon: TrendingUp, badge: 'Simulated', badgeColor: 'bg-white/10 text-white/60 border border-white/15' },
    'counter-opt': { label: 'Counter Optimization', icon: SlidersHorizontal, badge: 'Simulated', badgeColor: 'bg-white/10 text-white/60 border border-white/15' },
    'fairness': { label: 'Fairness & Priority', icon: Scale, badge: 'Simulated', badgeColor: 'bg-white/10 text-white/60 border border-white/15' },
    'analytics': { label: 'Analytics', icon: BarChart3 },
    'camera-monitor': { label: 'Camera Monitor', icon: Camera, badge: 'Live', badgeColor: 'bg-red-500/20 text-red-300 border border-red-500/30' },
    'users': { label: 'Users & Roles', icon: UserCog },
    'audit': { label: 'Audit Logs', icon: FileText },
  };

  const menuItems = visibleTabs(role).map((tab) => ({ id: tab, ...tabMeta[tab] }));

  return (
    <aside className={`${collapsed ? 'w-16 sm:w-20' : 'w-64'} h-full bg-white/[0.04] backdrop-blur-2xl text-white/80 flex flex-col shrink-0 border-r border-white/[0.12] transition-[width] duration-200 ease-out`}>

      {/* Navigation header & toggle */}
      <div className={`p-3 sm:p-4 flex items-center justify-between border-b border-white/[0.08] ${collapsed && !onToggleCollapse ? 'hidden' : ''}`}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
              Hospital Operations
            </span>
          </div>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/[0.1] border border-white/[0.08] transition-colors mx-auto cursor-pointer"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>
      
      {/* Menu items list */}
      <div className="p-2 sm:p-3 flex-1 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = selectedTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-3.5'} py-3 rounded-2xl text-xs font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-[#8e7dff]/30 to-purple-500/20 text-white font-bold border border-[#8e7dff]/50 shadow-[0_0_20px_rgba(142,125,255,0.3)]'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.08] border border-transparent'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#8e7dff]' : 'text-white/60'}`} />
                {!collapsed && <span className="tracking-tight">{item.label}</span>}
              </div>
              
              {!collapsed && item.badge !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-md ${
                  isActive ? 'bg-[#8e7dff]/40 text-white border border-[#8e7dff]/60' : item.badgeColor
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sensor Health Status Badge Box (Frosted Glass Card) */}
      {!collapsed && (
        <div className="p-4 m-3 rounded-2xl bg-white/[0.05] border border-white/[0.12] backdrop-blur-xl text-xs shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 font-semibold text-white text-[11px]">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Sensing Grid Online</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/15 px-1.5 py-0.5 rounded-md border border-emerald-500/30">42/42</span>
          </div>
          <p className="text-[11px] text-white/60 leading-relaxed mb-2.5">
            18 LiDAR nodes & 24 Thermal arrays transmitting spatial vectors. Zero biometrics stored.
          </p>
          <div className="flex items-center gap-1 text-[10px] text-white/80 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>100% Privacy Compliant</span>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-white/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
          {!collapsed && <span className="text-[11px] font-mono">v2.4 Glass Production</span>}
        </div>
        {!collapsed && (
          <button className="text-white/50 hover:text-white transition-colors cursor-pointer">
            <HelpCircle className="w-4 h-4" />
          </button>
        )}
      </div>

    </aside>
  );
};
