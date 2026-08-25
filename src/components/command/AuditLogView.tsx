import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { superAdminApi } from '../../services/superAdminApi';

/**
 * Audit log — the Command Center's `audit` tab (SUPER_ADMIN only).
 * Every privileged action recorded by recordAudit() on the server appears here,
 * newest first.
 */
export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setLogs(await superAdminApi.getAuditLogs());
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'The audit log could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/50">Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      {loadError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{loadError}</p>
            <button onClick={loadData} data-plain className="mt-1 text-xs font-semibold text-red-200 underline underline-offset-2 hover:text-white">
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-white/60">
          <span className="text-white font-semibold">{logs.length}</span> recent actions
        </span>
        <button
          onClick={loadData}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[620px]">
          <thead className="sticky top-0 bg-[#12122b] shadow-md">
            <tr className="bg-white/5 text-white/70 text-sm">
              <th className="p-4 font-medium">Time</th>
              <th className="p-4 font-medium">Actor</th>
              <th className="p-4 font-medium">Action</th>
              <th className="p-4 font-medium">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {logs.map(log => (
              <tr key={log.id} className="text-white text-sm">
                <td className="p-4 text-white/50">{new Date(log.timestamp).toLocaleString()}</td>
                <td className="p-4">
                  <div className="font-medium">{log.actorName}</div>
                  <div className="text-xs text-white/50">{log.actorRole}</div>
                </td>
                <td className="p-4">
                  <span className="bg-white/10 px-2 py-1 rounded text-xs font-mono">{log.action}</span>
                </td>
                <td className="p-4 text-white/70">
                  {log.targetType} ({log.targetId})
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-white/50">No audit entries yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
