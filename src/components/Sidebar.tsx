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

/**
 * Which section each destination belongs under.
 *
 * The kit groups its navigation under small-caps headings rather than running
 * one long list, which is the thing that makes a sidebar this length readable.
 * Grouping is presentation only — which items appear is still decided entirely
 * by visibleTabs(role), so no destination becomes reachable by being listed.
 */
const TAB_SECTION: Record<AdminTab, string> = {
  'my-visit': 'Main',
  'overview': 'Main',
  'live-queue': 'Main',
  'requests': 'Main',
  'my-patients': 'Main',
  'appointments': 'Clinic',
  'doctor-schedule': 'Clinic',
  'doctors': 'Clinic',
  'crowd-intel': 'Intelligence',
  'ai-predictions': 'Intelligence',
  'counter-opt': 'Intelligence',
  'fairness': 'Intelligence',
  'analytics': 'Intelligence',
  'camera-monitor': 'Monitoring',
  'users': 'Administration',
  'audit': 'Administration',
};

const SECTION_ORDER = ['Main', 'Clinic', 'Intelligence', 'Monitoring', 'Administration'];

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
    'live-queue': {
      label: 'Live Queue',
      icon: Users,
      badge: waitingCount,
      badgeColor: 'bg-[var(--pc-tint-lilac)] text-[var(--pc-primary)]',
    },
    'requests': {
      label: 'Requests',
      icon: ClipboardCheck,
      ...(requestCount > 0
        ? { badge: requestCount, badgeColor: 'bg-[#FEF3E7] text-[#B54708]' }
        : {}),
    },
    'my-patients': { label: 'My Patients', icon: UserRound },
    'appointments': { label: 'Appointments', icon: Calendar },
    'doctor-schedule': { label: 'Doctor Schedule', icon: Calendar },
    'doctors': { label: 'Doctors', icon: Stethoscope },
    'crowd-intel': { label: 'Crowd Intelligence', icon: Radar, badge: 'Simulated', badgeColor: 'bg-[var(--pc-page)] text-[var(--pc-text-subtle)]' },
    'ai-predictions': { label: 'AI Predictions', icon: TrendingUp, badge: 'Simulated', badgeColor: 'bg-[var(--pc-page)] text-[var(--pc-text-subtle)]' },
    'counter-opt': { label: 'Counter Optimization', icon: SlidersHorizontal, badge: 'Simulated', badgeColor: 'bg-[var(--pc-page)] text-[var(--pc-text-subtle)]' },
    'fairness': { label: 'Fairness & Priority', icon: Scale, badge: 'Simulated', badgeColor: 'bg-[var(--pc-page)] text-[var(--pc-text-subtle)]' },
    'analytics': { label: 'Analytics', icon: BarChart3 },
    'camera-monitor': { label: 'Camera Monitor', icon: Camera, badge: 'Live', badgeColor: 'bg-[#FEE4E2] text-[#B42318]' },
    'users': { label: 'Users & Roles', icon: UserCog },
    'audit': { label: 'Audit Logs', icon: FileText },
  };

  const permitted = visibleTabs(role);

  // Group without reordering within a section, and drop sections this role
  // cannot see anything in.
  const sections = SECTION_ORDER
    .map((section) => ({
      section,
      items: permitted
        .filter((tab) => TAB_SECTION[tab] === section)
        .map((tab) => ({ id: tab, ...tabMeta[tab] })),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      className={`pc ${collapsed ? 'w-16 sm:w-20' : 'w-64'} h-full shrink-0 flex flex-col border-r border-[var(--pc-border)] bg-[var(--pc-surface)] transition-[width] duration-200 ease-out`}
    >
      {/* Navigation header & toggle */}
      <div className={`flex items-center justify-between border-b border-[var(--pc-border)] px-4 py-3.5 ${collapsed && !onToggleCollapse ? 'hidden' : ''}`}>
        {!collapsed && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--pc-text-subtle)]">
            Hospital Operations
          </span>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="mx-auto rounded-md border border-[var(--pc-border)] p-1.5 text-[var(--pc-text-muted)] transition-colors hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)] cursor-pointer"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Menu items list */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 sm:px-3">
        {sections.map((group, groupIndex) => (
          <div key={group.section} className={groupIndex > 0 ? 'mt-5' : ''}>
            {!collapsed && (
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--pc-text-subtle)]">
                {group.section}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = selectedTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group flex w-full items-center rounded-md py-2.5 text-sm transition-colors duration-150 cursor-pointer ${
                      collapsed ? 'justify-center px-0' : 'justify-between px-2.5'
                    } ${
                      isActive
                        ? 'liquid-glass-active font-medium'
                        : 'font-normal text-[var(--pc-text-muted)] hover:bg-[var(--pc-page)] hover:text-[var(--pc-text)]'
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[var(--pc-primary)]' : 'text-[var(--pc-text-subtle)] group-hover:text-[var(--pc-primary)]'}`} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </span>

                    {!collapsed && item.badge !== undefined && (
                      <span
                        className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isActive ? 'bg-white/70 text-[var(--pc-primary)]' : item.badgeColor
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--pc-border)] px-4 py-3 text-xs text-[var(--pc-text-subtle)]">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--pc-success)]" />
          {!collapsed && <span className="text-[11px]">Connected</span>}
        </span>
      </div>
    </aside>
  );
};
