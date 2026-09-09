import React, { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { ActionLog, LogSeverity } from '../../types/job';

interface LogsScreenProps {
  logs: ActionLog[];
  onClearLogs: () => void;
  onExportLogs: () => void;
  theme: 'dark' | 'light';
}

export const LogsScreen: React.FC<LogsScreenProps> = ({
  logs,
  onClearLogs,
  onExportLogs,
  theme,
}) => {
  const isLight = theme === 'light';
  const [filterSeverity, setFilterSeverity] = useState<LogSeverity | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(log => {
    if (filterSeverity !== 'ALL' && log.severity !== filterSeverity) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        (log.platform && log.platform.toLowerCase().includes(q)) ||
        (log.nodeId && log.nodeId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Local Action Audit Logs</h2>
              <p className="text-xs text-neutral-400">
                Every UI query, gesture, tripwire check, and result is locally logged.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExportLogs}
              className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit JSON</span>
            </button>
            <button
              onClick={onClearLogs}
              className="px-3 py-2 rounded-xl border border-neutral-700/60 hover:bg-red-500/10 hover:border-red-500/30 text-neutral-400 hover:text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-neutral-800/40 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-neutral-400 font-medium flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter:</span>
            </span>
            {(['ALL', 'ACTION', 'SECURITY', 'WARN', 'ERROR', 'INFO'] as const).map(sev => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-colors ${
                  filterSeverity === sev
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isLight
                    ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    : 'bg-neutral-800/70 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search action or node..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs text-neutral-200 focus:outline-hidden focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Logs Table / List */}
      <div
        className={`rounded-2xl border overflow-hidden transition-all ${
          isLight ? 'bg-white border-neutral-200 shadow-xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-800/60 bg-neutral-950/40 text-neutral-400 text-[11px] uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Platform / Node</th>
                <th className="py-3 px-4">Safety Verified</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/40">
              {filteredLogs.length > 0 ? (
                filteredLogs.map(log => {
                  const dateStr = new Date(log.timestamp).toLocaleTimeString();
                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-neutral-800/30 transition-colors ${
                        log.severity === 'SECURITY'
                          ? 'bg-red-950/15'
                          : log.severity === 'WARN'
                          ? 'bg-amber-950/10'
                          : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-neutral-400 whitespace-nowrap">{dateStr}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.severity === 'SECURITY'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : log.severity === 'ERROR'
                              ? 'bg-red-500/15 text-red-300'
                              : log.severity === 'WARN'
                              ? 'bg-amber-500/20 text-amber-300'
                              : log.severity === 'ACTION'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-neutral-800 text-neutral-300'
                          }`}
                        >
                          {log.severity}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold font-mono text-neutral-200 whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-neutral-300">
                        {log.platform && (
                          <span className="font-bold text-purple-400 uppercase text-[10px] mr-1">
                            [{log.platform}]
                          </span>
                        )}
                        <span className="font-mono text-neutral-400 text-[11px] truncate max-w-[140px] inline-block align-middle">
                          {log.nodeId || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.safetyCheckPassed ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Passed</span>
                          </span>
                        ) : (
                          <span className="text-red-400 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Tripped</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-neutral-300 font-sans text-xs max-w-xs">{log.details}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-500 italic">
                    No action logs matching current filter.
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
