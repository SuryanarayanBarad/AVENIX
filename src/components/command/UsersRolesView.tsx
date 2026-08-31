import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Search, X, Users as UsersIcon } from 'lucide-react';
import { User } from '../../types';
import { superAdminApi } from '../../services/superAdminApi';

/** Roles a super admin may assign. SUPER_ADMIN is deliberately absent. */
const ASSIGNABLE_ROLES = [
  { value: 'VISITOR', label: 'Visitor' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'DOCTOR', label: 'Doctor' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ADMIN', label: 'Admin' },
];

/** Role pill colouring, on the light kit palette. */
const ROLE_TONE: Record<string, string> = {
  SUPER_ADMIN: 'bg-[#FCE7F3] text-[#9D174D] border-[#F5B8D0]',
  ADMIN: 'bg-[var(--pc-tint-lilac)] text-[var(--pc-primary)] border-[#C7C9F0]',
  MANAGER: 'bg-[#E0F2FE] text-[var(--pc-info-text)] border-[#A5D8F0]',
  DOCTOR: 'bg-[#E7F6EC] text-[var(--pc-success-text)] border-[#A6DCBB]',
  STAFF: 'bg-[#FEF3E7] text-[#B54708] border-[#F5C08A]',
  VISITOR: 'bg-[var(--pc-page)] text-[var(--pc-text-muted)] border-[var(--pc-border)]',
};

/**
 * Users & Roles — the Command Center's `users` tab (SUPER_ADMIN only).
 * The server refuses any role write from a non-super-admin, so this screen is
 * the convenience layer over that rule, not the rule itself.
 */
export const UsersRolesView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setUsers(await superAdminApi.getUsers());
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'The user list could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;
    try {
      await superAdminApi.updateUserRole(userId, newRole);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update role');
    }
  };

  /** How many accounts hold each role, so the filter shows its own weight. */
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) counts[u.role] = (counts[u.role] ?? 0) + 1;
    return counts;
  }, [users]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesRole = roleFilter === 'All' || u.role === roleFilter;
      const matchesSearch = !query
        || [u.name, u.email, u.role].some((v) => String(v ?? '').toLowerCase().includes(query));
      return matchesRole && matchesSearch;
    });
  }, [users, search, roleFilter]);

  // Every role actually present, plus the assignable ones, so a filter exists
  // for a role even before anybody holds it.
  const roleOptions = useMemo(() => {
    const present = Object.keys(roleCounts);
    const known = ASSIGNABLE_ROLES.map((r) => r.value);
    return Array.from(new Set([...known, ...present]));
  }, [roleCounts]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-[var(--pc-text-muted)]">
        Loading accounts…
      </div>
    );
  }

  return (
    <div className="pc flex flex-col gap-4">
      {loadError && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#F2B8B5] bg-[#FEE4E2] px-4 py-3 text-sm text-[var(--pc-danger-text)]">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{loadError}</p>
            <button
              onClick={loadData}
              data-plain
              className="mt-1 text-xs font-semibold underline underline-offset-2 hover:text-[var(--pc-text)] cursor-pointer"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="pc-card overflow-hidden">
        {/* Toolbar: count, search, role filter */}
        <div className="p-4 border-b border-[var(--pc-border)] flex flex-col lg:flex-row lg:items-center gap-3">
          <span className="text-sm text-[var(--pc-text-muted)] shrink-0 flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-[var(--pc-text-subtle)]" />
            <span className="text-[var(--pc-text)] font-semibold">{visible.length}</span>
            of {users.length} accounts
          </span>

          <div className="flex-1" />

          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--pc-text-subtle)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or role…"
              aria-label="Search users"
              className="pc-input w-full pl-9 pr-9 py-2 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                data-plain
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--pc-text-subtle)] hover:text-[var(--pc-text)] hover:bg-[var(--pc-page)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by role"
            className="pc-input pl-3 pr-8 py-2 text-sm font-medium cursor-pointer shrink-0"
          >
            <option value="All">All roles ({users.length})</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role.replace('_', ' ')} ({roleCounts[role] ?? 0})
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="bg-[var(--pc-page)] text-[var(--pc-text-subtle)] text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">Name</th>
                <th className="p-4 font-semibold">Email</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--pc-border)]">
              {visible.map((u) => (
                <tr key={u.id} className="text-[var(--pc-text)] hover:bg-[var(--pc-page)] transition-colors">
                  <td className="p-4 font-medium">{u.name}</td>
                  <td className="p-4 text-[var(--pc-text-muted)]">{u.email}</td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                        ROLE_TONE[u.role] ?? ROLE_TONE.VISITOR
                      }`}
                    >
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {u.role === 'SUPER_ADMIN' ? (
                      <span className="text-[var(--pc-text-subtle)] text-sm italic">Immutable</span>
                    ) : (
                      <select
                        className="pc-input px-2.5 py-1.5 text-sm cursor-pointer"
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        aria-label={`Change role for ${u.name}`}
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[var(--pc-text-muted)]">
                    {search || roleFilter !== 'All'
                      ? 'No accounts match these filters.'
                      : 'No accounts found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
