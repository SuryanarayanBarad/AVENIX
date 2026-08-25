import React, { useEffect, useState } from 'react';
import { AlertCircle, Search } from 'lucide-react';
import { User } from '../../types';
import { superAdminApi } from '../../services/superAdminApi';

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

  const query = search.trim().toLowerCase();
  const visible = query
    ? users.filter(u => [u.name, u.email, u.role].some(v => String(v ?? '').toLowerCase().includes(query)))
    : users;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/50">Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{loadError}</p>
            <button onClick={loadData} className="mt-1 text-xs font-semibold text-red-200 underline underline-offset-2 hover:text-white">
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-sm text-white/60">
            <span className="text-white font-semibold">{users.length}</span> accounts
          </span>
          <div className="relative sm:max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-pink-500/50"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="bg-white/5 text-white/70 text-sm">
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visible.map(u => (
                <tr key={u.id} className="text-white">
                  <td className="p-4">{u.name}</td>
                  <td className="p-4 text-white/70">{u.email}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${u.role === 'SUPER_ADMIN' ? 'bg-pink-500/20 text-pink-400' :
                        u.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400' :
                          u.role === 'DOCTOR' ? 'bg-blue-500/20 text-blue-300' :
                            'bg-white/10 text-white/70'
                      }`}>
                      {u.role}
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
                      >
                        <option value="VISITOR">Visitor</option>
                        <option value="STAFF">Staff</option>
                        <option value="DOCTOR">Doctor</option>
                        <option value="MANAGER">Manager</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-white/50">
                    {search ? `No accounts match "${search}".` : 'No accounts found.'}
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
