import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ShieldCheck,
  Zap,
  Server,
  Cpu,
  BarChart3
} from 'lucide-react';
import {
  isTiDBConfigured,
  testTiDBConnection,
  TiDBTestResult,
  getLastTiDBSyncTime
} from '../lib/tidb-client';
import {
  Asset,
  CheckoutRecord,
  MaintenanceRecord,
  BudgetAllocation,
  AuditLogItem,
  SystemNotification,
  User,
  Branch
} from '../types';

interface TiDBSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  checkouts: CheckoutRecord[];
  maintenances: MaintenanceRecord[];
  budgets: BudgetAllocation[];
  auditLogs: AuditLogItem[];
  notifications: SystemNotification[];
  users: User[];
  branches: Branch[];
  lastSyncedAt?: string;
  isLiveConnected?: boolean;
  onDataRefresh?: () => void;
  onDataImported?: () => void;
}

export const TiDBSyncModal: React.FC<TiDBSyncModalProps> = ({
  isOpen,
  onClose,
  assets,
  checkouts,
  maintenances,
  budgets,
  auditLogs,
  users,
  branches,
  lastSyncedAt = 'Local Cache',
  isLiveConnected = true,
  onDataRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'tiflash' | 'architecture'>('status');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TiDBTestResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      handleTestConnection();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testTiDBConnection();
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>TiDB Cloud HTAP Infrastructure</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Server-Managed Pool
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                PingCAP TiDB Cloud Serverless &bull; Multi-Tenant Database Health &bull; TiFlash Real-Time Analytics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/20">
          <button
            onClick={() => setActiveTab('status')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'status'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Connection Health</span>
          </button>
          <button
            onClick={() => setActiveTab('tiflash')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'tiflash'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>TiFlash HTAP Pool</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'architecture'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Security Architecture</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'status' && (
            <div className="space-y-5">
              {/* Telemetry Status Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Database Pool</div>
                  <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isLiveConnected ? 'Connected' : 'Degraded'}</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Latency</div>
                  <div className="text-sm font-bold text-cyan-400 mt-1">
                    {testResult ? `${testResult.latencyMs} ms` : 'Measuring...'}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Last Synced</div>
                  <div className="text-sm font-bold text-indigo-400 mt-1 font-mono text-[11px] truncate">
                    {lastSyncedAt || getLastTiDBSyncTime()}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Active Fleet Assets</div>
                  <div className="text-sm font-bold text-amber-400 mt-1">
                    {assets.length} Devices
                  </div>
                </div>
              </div>

              {/* Health Test Result Banner */}
              {testResult && (
                <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                  testResult.connected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {testResult.connected ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs space-y-1">
                    <div className="font-bold">{testResult.message}</div>
                    <div className="text-[11px] opacity-80">
                      Cluster: {testResult.clusterVersion} &bull; Roundtrip: {testResult.latencyMs}ms
                    </div>
                  </div>
                </div>
              )}

              {/* Live Relational Relays */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>Synchronized Relational Tables</span>
                  </h3>
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="px-3 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>Test Health Probe</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">assets</span>
                    <span className="font-bold text-emerald-400">{assets.length}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">checkouts</span>
                    <span className="font-bold text-emerald-400">{checkouts.length}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">maintenances</span>
                    <span className="font-bold text-emerald-400">{maintenances.length}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">budgets</span>
                    <span className="font-bold text-emerald-400">{budgets.length}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">branches</span>
                    <span className="font-bold text-emerald-400">{branches.length}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">users</span>
                    <span className="font-bold text-emerald-400">{users.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tiflash' && (
            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 space-y-2">
                <div className="font-bold text-indigo-300 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-400" />
                  <span>Real-Time Hybrid Transactional / Analytical Processing (HTAP)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  OmniAsset leverages PingCAP TiDB's Raft-synchronized TiFlash columnar replica pool.
                  Transactional asset updates and checkout events write instantaneously to row storage (TiKV)
                  while analytical queries, multi-branch depreciation rollups, and replacement forecasts execute in parallel on columnar replicas with zero write lock contention.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs">
                    <BarChart3 className="w-4 h-4" />
                    <span>Real-Time Fleet Valuation</span>
                  </div>
                  <div className="text-2xl font-black text-white">
                    ${assets.reduce((sum, a) => sum + (a.currentValue ?? a.purchaseCost ?? 0), 0).toLocaleString()}
                  </div>
                  <p className="text-[10px] text-slate-400">Total book valuation aggregated across active inventory.</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="font-bold text-cyan-400 flex items-center gap-1.5 text-xs">
                    <Cloud className="w-4 h-4" />
                    <span>Accumulated Depreciation</span>
                  </div>
                  <div className="text-2xl font-black text-white">
                    ${Math.max(0, assets.reduce((sum, a) => sum + (a.purchaseCost || 0) - (a.currentValue ?? a.purchaseCost ?? 0), 0)).toLocaleString()}
                  </div>
                  <p className="text-[10px] text-slate-400">Straight-line depreciation rollup across categories.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Strict Separation of Concerns & Security Hardening</span>
                </h3>
                <ul className="space-y-2 text-[11px] text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">&bull;</span>
                    <span>Database credentials, TLS CA validation, and connection pools are maintained exclusively in the secured server environment (<code className="text-emerald-300">server/config.ts</code>).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">&bull;</span>
                    <span>No database passwords, tokens, or schema DDL scripts are ever transmitted or stored in the browser client.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">&bull;</span>
                    <span>Every database operation is authorized against tenant session cookies with role-based branch scoping.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            OmniAsset Infrastructure Pool &bull; High Availability Mode
          </div>
          <div className="flex items-center gap-2">
            {onDataRefresh && (
              <button
                onClick={() => {
                  onDataRefresh();
                  onClose();
                }}
                className="px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer"
              >
                Refresh Data
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
