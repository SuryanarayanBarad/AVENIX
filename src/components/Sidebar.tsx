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
  Sparkles
} from 'lucide-react';
import { AdminTab } from '../types';

interface SidebarProps {
  currentTab?: AdminTab;
  activeTab?: AdminTab;
  onSelectTab?: (tab: AdminTab) => void;
  onTabChange?: (tab: AdminTab) => void;
  waitingCount?: number;
  alertCount?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  activeTab,
  onSelectTab,
  onTabChange,
  waitingCount = 147,
  collapsed = false,
  onToggleCollapse,
}) => {
  const selectedTab = currentTab || activeTab || 'overview';
  const handleTabClick = (tab: AdminTab) => {
    if (onSelectTab) onSelectTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const menuItems: { id: AdminTab; label: string; icon: React.FC<{ className?: string }>; badge?: string | number; badgeColor?: string }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'live-queue', label: 'Live Queue', icon: Users, badge: waitingCount, badgeColor: 'bg-[#8e7dff]/20 text-[#8e7dff] border border-[#8e7dff]/30' },
    { id: 'crowd-intel', label: 'Crowd Intelligence', icon: Radar, badge: 'LiDAR/Thermal', badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
    { id: 'ai-predictions', label: 'AI Predictions', icon: TrendingUp },
    { id: 'counter-opt', label: 'Counter Optimization', icon: SlidersHorizontal, badge: 'AI Balancer', badgeColor: 'bg-violet-500/20 text-violet-300 border border-violet-500/30' },
    { id: 'appointments', label: 'Appointments', icon: Calendar, badge: 142, badgeColor: 'bg-white/10 text-white/90 border border-white/15' },
    { id: 'fairness', label: 'Fairness & Priority', icon: Scale, badge: '94/100', badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <aside className={`${collapsed ? 'w-20' : 'w-64'} h-full bg-white/[0.04] backdrop-blur-2xl text-white/80 flex flex-col shrink-0 border-r border-white/[0.12] transition-[width] duration-200 ease-out`}>
      
      {/* Navigation header & toggle */}
      <div className="p-4 flex items-center justify-between border-b border-white/[0.08]">
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
      <div className="p-3 flex-1 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = selectedTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3.5 py-3 rounded-2xl text-xs font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out cursor-pointer ${
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
