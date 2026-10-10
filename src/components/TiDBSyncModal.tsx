import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  UploadCloud,
  ExternalLink,
  X,
  Layers,
  ShieldCheck,
  Sparkles,
  Zap,
  Server,
  Key,
  Eye,
  EyeOff,
  Save,
  Cpu,
  BarChart3
} from 'lucide-react';
import {
  getTiDBConfig,
  isTiDBConfigured,
  saveTiDBConfig,
  testTiDBConnection,
  seedBaselineToTiDB,
  TIDB_SETUP_SQL,
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
  notifications,
  users,
  branches,
  lastSyncedAt = 'Local Cache',
  isLiveConnected = false,
  onDataRefresh,
  onDataImported
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'sql' | 'tiflash' | 'guide'>('status');
  const [copiedSql, setCopiedSql] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TiDBTestResult | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ success: boolean; message: string; rowsAffected: number } | null>(null);

  // Form input state
  const [host, setHost] = useState('');
  const [port, setPort] = useState(4000);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('it_asset_ledger');
  const [ssl, setSsl] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState(false);

  // Load config on mount or open
  useEffect(() => {
    if (isOpen) {
      const cfg = getTiDBConfig();
      setHost(cfg.host);
      setPort(cfg.port);
      setUser(cfg.user);
      setPassword(cfg.password || '');
      setDatabase(cfg.database);
      setSsl(cfg.ssl);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentConfig = getTiDBConfig();
  const configured = isTiDBConfigured();

  const handleSaveConfig = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    saveTiDBConfig({
      host,
      port,
      user,
      password,
      database,
      ssl
    });
    setSavedSuccessMsg(true);
    setTimeout(() => setSavedSuccessMsg(false), 3000);
  };

  const handleCopySql = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(TIDB_SETUP_SQL);
      } else {
        const ta = document.createElement('textarea');
        ta.value = TIDB_SETUP_SQL;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      // First persist the latest inputs
      saveTiDBConfig({ host, port, user, password, database, ssl });
      const res = await testTiDBConnection({ host, port, user, password, database, ssl });
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    setSeedResult(null);
    try {
      const res = await seedBaselineToTiDB({
        assets,
        checkouts,
        maintenances,
        budgets,
        auditLogs,
        notifications,
        users,
        branches
      });
      setSeedResult(res);
      if (res.success) {
        onDataRefresh?.();
        onDataImported?.();
      }
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Zap className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>TiDB Cloud Distributed Ledger</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    HTAP + TiFlash
                  </span>
                </h3>
                {isLiveConnected ? (
                  <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>Cluster Live</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Offline-First Local Cache
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Distributed MySQL 8.0 compatible transactional backend with columnar TiFlash analytics for enterprise asset rollups.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-4 md:px-5 pt-2 gap-2 text-xs overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('status')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'status'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Cluster Connection &amp; Fleet Sync
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'sql'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            TiDB DDL Schema (1-Click SQL)
          </button>
          <button
            onClick={() => setActiveTab('tiflash')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'tiflash'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>TiFlash HTAP Architecture</span>
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === 'guide'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Quick Setup Guide
          </button>
        </div>

        {/* Body content */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-5 text-xs text-slate-300 flex-1">
          {activeTab === 'status' && (
            <div className="space-y-5">
              {/* Cluster Config Credentials Form */}
              <div className="p-4 md:p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Server className="w-4 h-4 text-amber-400" />
                      <span>TiDB Cloud Cluster Connection Parameters</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Configure your PingCAP TiDB Serverless or Dedicated endpoint credentials.
                    </p>
                  </div>
                  {savedSuccessMsg && (
                    <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Check className="w-3 h-3" /> Settings saved locally!
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Gateway Host <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={host}
                      onChange={e => setHost(e.target.value)}
                      placeholder="e.g. gateway01.us-east-1.prod.aws.tidbcloud.com"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        value={port}
                        onChange={e => setPort(Number(e.target.value))}
                        placeholder="4000"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Database Name <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={database}
                        onChange={e => setDatabase(e.target.value)}
                        placeholder="it_asset_ledger"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Cluster User ID <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={user}
                      onChange={e => setUser(e.target.value)}
                      placeholder="e.g. 3yR7K9m.root"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Password</span>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-slate-400 hover:text-slate-200 text-[10px] flex items-center gap-1"
                      >
                        {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showPassword ? 'Hide' : 'Show'}</span>
                      </button>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="TiDB Cloud Cluster Password"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono pr-8"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      id="tidbSsl"
                      checked={ssl}
                      onChange={e => setSsl(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="tidbSsl" className="cursor-pointer">
                      TLS/SSL Encrypted (Required for TiDB Serverless on port 4000)
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveConfig()}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition"
                    >
                      <Save className="w-3.5 h-3.5 text-slate-300" />
                      <span>Save Credentials</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                      <span>{isTesting ? 'Testing Handshake...' : 'Test Connection'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSeedData}
                      disabled={isSeeding}
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition disabled:opacity-50"
                    >
                      <UploadCloud className={`w-3.5 h-3.5 ${isSeeding ? 'animate-bounce' : ''}`} />
                      <span>{isSeeding ? 'Syncing...' : 'Push Fleet to TiDB'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Test Connection Results Card */}
              {testResult && (
                <div
                  className={`p-4 rounded-xl border flex flex-col space-y-2.5 ${
                    testResult.connected
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {testResult.connected ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                      )}
                      <span className="font-bold text-sm text-white">
                        {testResult.connected ? 'TiDB Connection Successful' : 'Connection Check Notice'}
                      </span>
                    </div>
                    {testResult.connected && (
                      <span className="font-mono text-[10px] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700 text-emerald-300">
                        {testResult.latencyMs}ms | {testResult.clusterVersion}
                      </span>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed">{testResult.message}</p>

                  {testResult.tableStatus && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Relational Schema &amp; TiFlash HTAP Health:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                        {Object.entries(testResult.tableStatus).map(([tbl, ok]) => (
                          <div
                            key={tbl}
                            className={`px-2 py-1 rounded text-[10px] font-mono flex items-center justify-between border ${
                              ok
                                ? 'bg-slate-950/80 border-emerald-500/30 text-emerald-300'
                                : 'bg-slate-950/80 border-red-500/30 text-red-300'
                            }`}
                          >
                            <span>{tbl}</span>
                            <span className="font-bold">{ok ? 'ONLINE' : 'MISSING'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Seed Data Status Notice */}
              {seedResult && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start space-x-2.5 ${
                    seedResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-xs text-white">{seedResult.message}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Distributed transaction committed across TiKV row storage with asynchronous replica to TiFlash analytical columnar pool.
                    </p>
                  </div>
                </div>
              )}

              {/* Data Entities Summary */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    In-Memory Fleet Ledger ({assets.length + checkouts.length + maintenances.length + budgets.length + users.length + branches.length} Total Entities)
                  </h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Last Sync: {getLastTiDBSyncTime()}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition">
                    <span className="text-slate-400 block text-[11px]">Hardware Assets</span>
                    <span className="text-base font-bold text-white">{assets.length}</span>
                    <span className="text-[10px] text-emerald-400 font-mono block">TiKV + TiFlash Replica</span>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition">
                    <span className="text-slate-400 block text-[11px]">Custody Checkouts</span>
                    <span className="text-base font-bold text-white">{checkouts.length}</span>
                    <span className="text-[10px] text-indigo-400 font-mono block">TiKV + TiFlash Replica</span>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition">
                    <span className="text-slate-400 block text-[11px]">Maintenance Tickets</span>
                    <span className="text-base font-bold text-white">{maintenances.length}</span>
                    <span className="text-[10px] text-amber-400 font-mono block">TiKV + TiFlash Replica</span>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition">
                    <span className="text-slate-400 block text-[11px]">Staff Users</span>
                    <span className="text-base font-bold text-white">{users.length}</span>
                    <span className="text-[10px] text-purple-400 font-mono block">Multi-Tenant RBAC</span>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition">
                    <span className="text-slate-400 block text-[11px]">Branches</span>
                    <span className="text-base font-bold text-white">{branches.length}</span>
                    <span className="text-[10px] text-blue-400 font-mono block">Geo Distributed Hubs</span>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition">
                    <span className="text-slate-400 block text-[11px]">Fiscal Budgets</span>
                    <span className="text-base font-bold text-white">{budgets.length}</span>
                    <span className="text-[10px] text-emerald-400 font-mono block">TiKV + TiFlash Replica</span>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition">
                    <span className="text-slate-400 block text-[11px]">Audit Logs</span>
                    <span className="text-base font-bold text-white">{auditLogs.length}</span>
                    <span className="text-[10px] text-slate-400 font-mono block">Immutable Ledger</span>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition">
                    <span className="text-slate-400 block text-[11px]">System Alerts</span>
                    <span className="text-base font-bold text-white">{notifications.length}</span>
                    <span className="text-[10px] text-rose-400 font-mono block">Warranty Triggers</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-amber-400" />
                    <span>PingCAP TiDB Complete 11-Table DDL Schema</span>
                  </h4>
                  <p className="text-slate-400 text-[11px]">
                    MySQL 8.0 wire-compatible distributed DDL with foreign keys, composite indexes, and TiFlash columnar replicas.
                  </p>
                </div>
                <button
                  onClick={handleCopySql}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition shrink-0"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copied to Clipboard!' : 'Copy TiDB SQL'}</span>
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-[11px] text-slate-300 max-h-96 overflow-y-auto leading-relaxed select-all">
                <pre>{TIDB_SETUP_SQL}</pre>
              </div>
            </div>
          )}

          {activeTab === 'tiflash' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-emerald-500/10 border border-amber-500/20 space-y-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-amber-400" />
                  <h4 className="text-sm font-bold text-white">Why PingCAP TiDB &amp; TiFlash for Asset Management?</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Traditional relational databases force you to choose between fast transactional writes (OLTP) and complex reporting queries (OLAP). TiDB provides true <strong>HTAP (Hybrid Transactional and Analytical Processing)</strong>:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <Zap className="w-4 h-4" />
                    <h5 className="font-bold text-xs uppercase tracking-wide">TiKV (Row Storage - OLTP)</h5>
                  </div>
                  <ul className="text-slate-400 text-[11px] space-y-1.5 list-disc list-inside">
                    <li>Sub-millisecond barcode &amp; QR check-ins / check-outs</li>
                    <li>Strong ACID consistency powered by Multi-Raft consensus</li>
                    <li>Automatic horizontal sharding across storage nodes</li>
                    <li>Zero single points of failure across branches</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center space-x-2 text-amber-400">
                    <BarChart3 className="w-4 h-4" />
                    <h5 className="font-bold text-xs uppercase tracking-wide">TiFlash (Columnar Pool - OLAP)</h5>
                  </div>
                  <ul className="text-slate-400 text-[11px] space-y-1.5 list-disc list-inside">
                    <li>Sub-second depreciation calculations across 50,000+ assets</li>
                    <li>Asynchronously replicates from TiKV via Raft Learner</li>
                    <li>Zero lock contention: analytical scans never block checkouts</li>
                    <li>TiDB CBO optimizer automatically routes heavy queries here</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h5 className="font-bold text-xs text-white">Sample HTAP Optimizer Query (3D Depreciation Telemetry)</h5>
                <p className="text-[11px] text-slate-400">
                  Using TiDB&apos;s cost-based optimizer hint <code className="text-amber-300 font-mono">/*+ READ_FROM_STORAGE(TIFLASH[a, b]) */</code>:
                </p>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-amber-200/90 overflow-x-auto">
                  <pre>{`SELECT /*+ READ_FROM_STORAGE(TIFLASH[a, b]) */
  b.name AS branch_name,
  a.category_name,
  COUNT(a.id) AS total_assets,
  SUM(a.purchase_cost) AS total_investment,
  SUM(a.current_value) AS net_book_value,
  AVG(TIMESTAMPDIFF(MONTH, a.purchase_date, NOW())) AS avg_age_months
FROM assets a
JOIN branches b ON a.branch_id = b.id
WHERE a.status != 'DISPOSED'
GROUP BY b.name, a.category_name
ORDER BY net_book_value DESC;`}</pre>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h5 className="font-bold text-xs text-white">Client Driver Integration (Node.js / Next.js / Serverless)</h5>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
                  <pre>{`import { connect } from '@tidbcloud/serverless';

const conn = connect({
  url: process.env.DATABASE_URL // e.g. mysql://user:pass@host:4000/it_asset_ledger
});

export async function getLiveAssets() {
  const response = await conn.execute('SELECT * FROM assets WHERE status = ?', ['ACTIVE']);
  return response.rows;
}`}</pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>How to Link your TiDB Cloud Cluster in 5 Minutes</span>
              </h4>

              <ol className="space-y-3 list-decimal list-inside text-slate-300 text-xs">
                <li className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <strong className="text-white">Create a Free TiDB Cloud Cluster:</strong> Go to{' '}
                  <a
                    href="https://tidbcloud.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-400 underline inline-flex items-center gap-1 font-semibold"
                  >
                    tidbcloud.com <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  and sign up for free. Create a <strong>TiDB Serverless</strong> cluster (free 5 GiB storage and 50M Request Units per month).
                </li>
                <li className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <strong className="text-white">Run Schema in Cloud SQL Editor or Chat2Query:</strong> In your TiDB Cloud console, click on <strong>SQL Editor</strong> or <strong>Chat2Query</strong>. Copy the full script from the &ldquo;TiDB DDL Schema&rdquo; tab above and click <strong>Run</strong>.
                </li>
                <li className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <strong className="text-white">Copy Connection Credentials:</strong> Click <strong>Connect</strong> in the TiDB Cloud console. Select &ldquo;General&rdquo; or &ldquo;MySQL CLI&rdquo;. Copy your <strong>Gateway Host</strong> (e.g. <code className="text-amber-300 font-mono">gateway01.us-east-1.prod.aws.tidbcloud.com</code>), <strong>User</strong>, and generate a <strong>Password</strong>.
                </li>
                <li className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <strong className="text-white">Save in this Portal:</strong> Paste your host, user, and password into the &ldquo;Cluster Connection &amp; Fleet Sync&rdquo; tab above and click &ldquo;Save Credentials&rdquo;.
                </li>
                <li className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                  <strong className="text-white">Sync Fleet Data:</strong> Click <strong>&ldquo;Test Connection&rdquo;</strong> to verify latency and tables, then click <strong>&ldquo;Push Fleet to TiDB&rdquo;</strong> to synchronize all company branches, staff accounts, and assets to distributed cloud storage!
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Dual-Engine Ledger: Local Cache Offline-First + PingCAP TiDB Cloud HTAP</span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
