/**
 * ---------------------------------------------------------------------------
 * Role capabilities — the single source of truth
 * ---------------------------------------------------------------------------
 *
 * This module has NO imports on purpose: it is loaded by the Express server
 * (as ./lib/permissions.js) and by the React app alike. Sidebar visibility and
 * API authorization therefore read the same table and can never drift apart.
 *
 * Hiding a tab is presentation. Authorization is `hasPermission` on the server.
 */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'DOCTOR' | 'VISITOR';

export type CommandTab =
  | 'my-visit'
  | 'ai-health'
  | 'overview'
  | 'live-queue'
  | 'requests'
  | 'my-patients'
  | 'appointments'
  | 'doctor-schedule'
  | 'doctors'
  | 'users'
  | 'audit'
  | 'crowd-intel'
  | 'ai-predictions'
  | 'counter-opt'
  | 'fairness'
  | 'analytics'
  | 'camera-monitor';

export type Permission =
  | 'queue:read'
  | 'queue:manage'
  | 'queue:edit'
  | 'appointments:read'
  | 'appointments:manage'
  | 'appointments:desk-book'
  | 'doctors:read'
  | 'doctors:manage'
  | 'schedule:read'
  | 'schedule:manage'
  | 'analytics:read'
  | 'cameras:read'
  | 'cameras:manage'
  | 'users:manage'
  | 'audit:read'
  | 'own:appointments'
  | 'own:queue'
  | 'own:visit'
  /** Use AI health navigation on your OWN reports and symptoms. */
  | 'own:health';

/**
 * What each role may do. DOCTOR deliberately holds only `own:*` permissions —
 * their data is scoped to themselves by requireDoctor, never facility-wide.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    'queue:read', 'queue:manage', 'queue:edit',
    'appointments:read', 'appointments:manage', 'appointments:desk-book',
    'doctors:read', 'doctors:manage',
    'schedule:read', 'schedule:manage',
    'analytics:read',
    'cameras:read', 'cameras:manage',
    'users:manage', 'audit:read',
    'own:health',
  ],
  ADMIN: [
    'queue:read', 'queue:manage', 'queue:edit',
    'appointments:read', 'appointments:manage', 'appointments:desk-book',
    'doctors:read',
    'schedule:read', 'schedule:manage',
    'analytics:read',
    'cameras:read', 'cameras:manage',
    'own:health',
  ],
  MANAGER: [
    'queue:read', 'queue:manage', 'queue:edit',
    'appointments:read', 'appointments:manage', 'appointments:desk-book',
    'doctors:read',
    'schedule:read', 'schedule:manage',
    'analytics:read',
    'cameras:read', 'cameras:manage',
    'own:health',
  ],
  // Staff run the floor: they move the queue along but do not reschedule
  // clinics, reconfigure cameras, or read facility analytics.
  STAFF: [
    'queue:read', 'queue:manage',
    'appointments:read', 'appointments:desk-book',
    'doctors:read',
    'cameras:read',
    'own:health',
  ],
  DOCTOR: ['own:appointments', 'own:queue', 'own:health'],
  VISITOR: ['own:visit', 'own:health'],
};

/** Every tab names the permission that backs it, so UI and API agree. */
export const TAB_PERMISSION: Record<CommandTab, Permission> = {
  'my-visit': 'own:visit',
  'ai-health': 'own:health',
  'overview': 'queue:read',
  'live-queue': 'queue:read',
  'requests': 'own:appointments',
  'my-patients': 'own:appointments',
  'appointments': 'appointments:read',
  'doctor-schedule': 'schedule:read',
  'doctors': 'doctors:read',
  'users': 'users:manage',
  'audit': 'audit:read',
  'crowd-intel': 'analytics:read',
  'ai-predictions': 'analytics:read',
  'counter-opt': 'analytics:read',
  'fairness': 'analytics:read',
  'analytics': 'analytics:read',
  'camera-monitor': 'cameras:read',
};

/**
 * Tab order in the sidebar. Each role sees the subset it has permission for,
 * in this order, so the navigation reads consistently for everyone.
 */
export const TAB_ORDER: CommandTab[] = [
  'my-visit',
  'ai-health',
  'overview',
  'live-queue',
  'requests',
  'my-patients',
  'appointments',
  'doctor-schedule',
  'doctors',
  'crowd-intel',
  'ai-predictions',
  'counter-opt',
  'fairness',
  'analytics',
  'camera-monitor',
  'users',
  'audit',
];

/** Doctors reach the overview and their own queue through `own:*` grants. */
const DOCTOR_EXTRA_TABS: CommandTab[] = ['overview', 'live-queue'];

/**
 * Tabs every signed-in role can open, whatever their permissions.
 *
 * The overview is the one screen everybody should land on, but TAB_PERMISSION
 * maps a tab to a single permission and no single permission means "everyone".
 * Mapping it to own:visit made it visible to patients and doctors and took it
 * away from staff and administrators, which is the opposite of the intent.
 *
 * What each role SEES there still differs: AdminDashboard renders the
 * operational overview for anyone holding queue:read and a visitor-safe one for
 * everybody else. This list governs reachability only — never content, and
 * never what an endpoint will return.
 */
const ALWAYS_VISIBLE_TABS: CommandTab[] = ['overview'];

export function hasPermission(role: string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const granted = ROLE_PERMISSIONS[role as Role];
  return Array.isArray(granted) && granted.includes(permission);
}

export function canAccessTab(role: string | undefined | null, tab: CommandTab): boolean {
  if (!role) return false;
  if (ALWAYS_VISIBLE_TABS.includes(tab)) return true;
  if (role === 'DOCTOR' && DOCTOR_EXTRA_TABS.includes(tab)) return true;
  return hasPermission(role, TAB_PERMISSION[tab]);
}

export function visibleTabs(role: string | undefined | null): CommandTab[] {
  return TAB_ORDER.filter((tab) => canAccessTab(role, tab));
}

/** Where each role lands when it opens the Command Center. */
export const DEFAULT_TAB: Record<Role, CommandTab> = {
  SUPER_ADMIN: 'overview',
  ADMIN: 'overview',
  MANAGER: 'overview',
  STAFF: 'live-queue',
  DOCTOR: 'overview',
  VISITOR: 'my-visit',
};

export function defaultTabForRole(role: string | undefined | null): CommandTab {
  const tab = DEFAULT_TAB[role as Role];
  if (tab && canAccessTab(role, tab)) return tab;
  return visibleTabs(role)[0] ?? 'my-visit';
}
