import React, { useState, useMemo } from 'react';
import { MaintenanceRecord, Asset, User } from '../types';
import { MaintenanceService } from '../lib/maintenance-service';
import { MaintenanceCard } from './MaintenanceCard';
import { MaintenanceForm } from './MaintenanceForm';
import { MaintenanceDetailModal } from './MaintenanceDetailModal';
import { AssetMaintenanceHistoryModal } from './AssetMaintenanceHistoryModal';
import { RepairsSummaryModal } from './RepairsSummaryModal';
import {
  Wrench, AlertTriangle, CheckCircle2, Clock, Plus, Download,
  Filter, Search, BarChart3, Layers, Calendar, History
} from 'lucide-react';

interface MaintenancePanelProps {
  maintenances: MaintenanceRecord[];
  assets: Asset[];
  users?: User[];
  currentUser?: User;
  onReportIssue: (record: MaintenanceRecord) => void;
  onUpdateTicket?: (updatedRecord: MaintenanceRecord) => void;
  onCompleteRepair: (recordId: string) => void;
}

export const MaintenancePanel: React.FC<MaintenancePanelProps> = ({
  maintenances,
  assets,
  users = [],
  currentUser = { id: 'usr-super-admin-ishmael', fullName: 'Ishmael (Super Admin)', role: 'ADMIN', orgId: 'org-omnitech', branchId: 'branch-main', email: 'ishmaelt42@gmail.com' },
  onReportIssue,
  onUpdateTicket,
  onCompleteRepair
}) => {
  const [viewType, setViewType] = useState<'GRID' | 'TABLE'>('GRID');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDetailRecord, setSelectedDetailRecord] = useState<MaintenanceRecord | null>(null);
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  const [showRepairsSummary, setShowRepairsSummary] = useState(false);

  // Filters state
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [techFilter, setTechFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const recordsSectionRef = React.useRef<HTMLDivElement>(null);
  const createModalBodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (showCreateModal && createModalBodyRef.current) {
      createModalBodyRef.current.scrollTop = 0;
      const timer = setTimeout(() => {
        const firstField = createModalBodyRef.current?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
        );
        firstField?.focus();
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [showCreateModal]);

  const today = new Date().toISOString().split('T')[0]!;

  // KPI Calculations
  const kpis = useMemo(() => {
    const pending = maintenances.filter(m => m.status === 'PENDING').length;
    const inProgress = maintenances.filter(m => m.status === 'IN_PROGRESS').length;
    const overdue = maintenances.filter(m => m.status === 'IN_PROGRESS' && m.expectedCompletion < today).length;
    const completedMonth = maintenances.filter(m => m.status === 'COMPLETED').length;
    return { pending, inProgress, overdue, completedMonth };
  }, [maintenances, today]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return MaintenanceService.getMaintenanceRecords(maintenances, {
      status: statusFilter,
      type: typeFilter,
      priority: priorityFilter,
      assignedTechnician: techFilter,
      searchQuery
    });
  }, [maintenances, statusFilter, typeFilter, priorityFilter, techFilter, searchQuery]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Asset Code', 'Asset Name', 'Type', 'Status', 'Priority', 'Reported By', 'Assigned Tech', 'Start Date', 'Expected Completion', 'Cost', 'Parts Replaced'];
    const rows = filteredRecords.map(m => [
      m.id,
      `"${m.assetCode}"`,
      `"${m.assetName}"`,
      m.type,
      m.status,
      m.priority || 'MEDIUM',
      `"${m.reportedBy}"`,
      `"${m.assignedTechnician}"`,
      m.startDate,
      m.expectedCompletion,
      m.cost || 0,
      `"${m.partsReplaced || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `maintenance_repairs_log_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Create Ticket Submit
  const handleFormSubmit = (payload: any) => {
    const newRecord: MaintenanceRecord = {
      id: `mnt-${Date.now()}`,
      assetId: payload.assetId,
      assetCode: payload.assetCode,
      assetName: payload.assetName,
      type: payload.type,
      status: 'IN_PROGRESS',
      priority: payload.priority,
      description: payload.description,
      reportedBy: currentUser.fullName || 'IT Staff',
      assignedTechnician: payload.assignedTechnician,
      startDate: payload.startDate,
      expectedCompletion: payload.expectedCompletion,
      cost: payload.cost || 0,
      partsReplaced: payload.partsReplaced,
      notes: payload.notes
    };

    onReportIssue(newRecord);
    setShowCreateModal(false);
  };

  const repairsSummaryStats = useMemo(() => {
    return MaintenanceService.getRepairsSummary(maintenances, assets);
  }, [maintenances, assets]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200 text-xs">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/95 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-rose-400 shrink-0" />
            <span>Maintenance & Repairs Dashboard</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Track hardware outages, expected completion deadlines, replacement parts costs, and overdue technician work orders.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRepairsSummary(true)}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold px-3.5 py-2 rounded-xl border border-emerald-500/30 transition-all shadow-lg"
            >
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Repairs Summary</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-xl shadow-lg shadow-rose-600/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Report Outage</span>
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
          {/* Overdue Alert Banner */}
          {kpis.overdue > 0 && (
            <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-rose-300">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 shrink-0"><AlertTriangle className="w-5 h-5" /></div>
                <div>
                  <h4 className="font-bold text-white text-sm">{kpis.overdue} Overdue Maintenance Work Orders</h4>
                  <p className="text-xs text-rose-200/90 mt-0.5">Target completion deadlines have elapsed for hardware under active repair. Immediate triage advised.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setStatusFilter('IN_PROGRESS');
                  recordsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shrink-0 self-start sm:self-center"
              >
                Filter Overdue Tickets
              </button>
            </div>
          )}

          {/* 4 Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-xl">
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-mono block">Pending Maintenance</span>
                <span className="text-blue-400 font-mono font-bold text-2xl mt-1 block">{kpis.pending}</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Awaiting bench assignment</span>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20"><Clock className="w-6 h-6" /></div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-xl">
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-mono block">Active In Progress</span>
                <span className="text-amber-400 font-mono font-bold text-2xl mt-1 block">{kpis.inProgress}</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Bench repair or diagnostics</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20"><Wrench className="w-6 h-6" /></div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-xl">
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-mono block">Overdue Alerts</span>
                <span className="text-rose-400 font-mono font-bold text-2xl mt-1 block">{kpis.overdue}</span>
                <span className="text-[10px] text-rose-300 mt-1 block">Exceeded expected completion</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20"><AlertTriangle className="w-6 h-6" /></div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-xl">
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-mono block">Completed This Month</span>
                <span className="text-emerald-400 font-mono font-bold text-2xl mt-1 block">{kpis.completedMonth}</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Restored back to active</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-6 h-6" /></div>
            </div>
          </div>

          {/* Filter Bar */}
          <div ref={recordsSectionRef} className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search by asset code, device name, issue, technician..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-white placeholder-slate-600 focus:border-rose-500 focus:outline-none"
                />
              </div>

              {/* Action Utilities */}
              <div className="flex items-center gap-2 self-end lg:self-center">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setViewType('GRID')}
                    className={`px-3 py-1 rounded-lg font-bold transition-all ${viewType === 'GRID' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Cards
                  </button>
                  <button
                    onClick={() => setViewType('TABLE')}
                    className={`px-3 py-1 rounded-lg font-bold transition-all ${viewType === 'TABLE' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Table
                  </button>
                </div>

                <button
                  onClick={handleExportCSV}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl font-bold border border-slate-700 transition-all shadow-md"
                >
                  <Download className="w-3.5 h-3.5 text-rose-400" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Dropdown filters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Status</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">⏳ PENDING</option>
                  <option value="IN_PROGRESS">⚙️ IN PROGRESS</option>
                  <option value="COMPLETED">✓ COMPLETED</option>
                  <option value="CANCELLED">✕ CANCELLED</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Type</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
                  <option value="ALL">All Maintenance Types</option>
                  <option value="REPAIR">🚨 REPAIR</option>
                  <option value="PREVENTIVE">🛡️ PREVENTIVE</option>
                  <option value="INSPECTION">🔍 INSPECTION</option>
                  <option value="UPGRADE">⚡ UPGRADE</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Priority</label>
                <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
                  <option value="ALL">All Priorities</option>
                  <option value="HIGH">🔴 HIGH</option>
                  <option value="MEDIUM">🟡 MEDIUM</option>
                  <option value="LOW">🔵 LOW</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Technician</label>
                <select value={techFilter} onChange={e => setTechFilter(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
                  <option value="ALL">All Techs / Teams</option>
                  <option value="Chen Wei">Chen Wei (IT Support)</option>
                  <option value="IT Repair Pool">IT Repair Pool</option>
                  <option value="Sarah">Sarah Jenkins</option>
                </select>
              </div>
            </div>
          </div>

          {/* Asset History quick trigger bar */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-300">
              <History className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Inspect asset-specific maintenance history & breakdown logs:</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                onChange={e => {
                  const ast = assets.find(a => a.id === e.target.value);
                  if (ast) setHistoryAsset(ast);
                }}
                defaultValue=""
                className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white max-w-xs"
              >
                <option value="" disabled>Select hardware device...</option>
                {assets.map(a => <option key={a.id} value={a.id}>[{a.assetCode}] {a.name}</option>)}
              </select>
            </div>
          </div>

          {/* Records Display */}
          {filteredRecords.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/60 rounded-2xl border border-slate-800 text-slate-500">
              <Wrench className="w-10 h-10 text-slate-600 mx-auto mb-3 opacity-50" />
              <p className="font-bold text-slate-400 text-sm">No maintenance or repair work orders match your active criteria.</p>
              <button onClick={() => { setStatusFilter('ALL'); setTypeFilter('ALL'); setPriorityFilter('ALL'); setTechFilter('ALL'); setSearchQuery(''); }} className="mt-3 text-rose-400 underline font-bold">
                Reset All Filters
              </button>
            </div>
          ) : viewType === 'GRID' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredRecords.map(rec => {
                const ast = assets.find(a => a.id === rec.assetId);
                return (
                  <MaintenanceCard
                    key={rec.id}
                    record={rec}
                    asset={ast}
                    onViewDetail={setSelectedDetailRecord}
                    onQuickComplete={onCompleteRepair}
                  />
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase font-mono text-slate-400 bg-slate-950/80">
                      <th className="p-3.5">Asset</th>
                      <th className="p-3.5">Type</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Priority</th>
                      <th className="p-3.5">Assigned Tech</th>
                      <th className="p-3.5">Start Date</th>
                      <th className="p-3.5">ETA</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono text-slate-300">
                    {filteredRecords.map(rec => {
                      const ast = assets.find(a => a.id === rec.assetId);
                      const isOver = rec.status === 'IN_PROGRESS' && rec.expectedCompletion < today;
                      return (
                        <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors group">
                          <td className="p-3.5 font-sans">
                            <div className="flex items-center gap-2.5">
                              {ast?.image ? (
                                <img src={ast.image} alt={ast.name} className="w-8 h-8 rounded-lg object-cover border border-slate-700 shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-rose-400 shrink-0"><Wrench className="w-4 h-4" /></div>
                              )}
                              <div>
                                <span className="font-mono text-[10px] font-bold text-rose-400 block">{rec.assetCode}</span>
                                <span className="font-bold text-white text-xs truncate max-w-[140px] block">{rec.assetName}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5"><span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-200">{rec.type}</span></td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rec.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' :
                              isOver ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {rec.status}
                            </span>
                          </td>
                          <td className="p-3.5 font-sans font-bold text-slate-200">{rec.priority || 'MEDIUM'}</td>
                          <td className="p-3.5 font-sans text-emerald-400 truncate max-w-[130px]">{rec.assignedTechnician}</td>
                          <td className="p-3.5 text-slate-400">{rec.startDate}</td>
                          <td className={`p-3.5 font-bold ${isOver ? 'text-rose-400' : 'text-slate-300'}`}>
                            {rec.expectedCompletion} {isOver && '⚠️'}
                          </td>
                          <td className="p-3.5 text-right font-sans space-x-2">
                            {rec.status === 'IN_PROGRESS' && (
                              <button onClick={() => onCompleteRepair(rec.id)} className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[10px]">Complete</button>
                            )}
                            <button onClick={() => setSelectedDetailRecord(rec)} className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-semibold text-[10px]">View</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      {/* CREATE TICKET MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150">
          <div ref={createModalBodyRef} className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1">✕</button>
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>Create Maintenance / Repair Ticket</span>
            </h3>

            <MaintenanceForm
              assets={assets}
              technicians={users.filter(u => u.role === 'IT_SUPPORT' || u.role === 'ADMIN') || []}
              onSubmit={handleFormSubmit}
              onCancel={() => setShowCreateModal(false)}
            />
          </div>
        </div>
      )}

      {/* DETAIL MODAL (File 5) */}
      {selectedDetailRecord && (
        <MaintenanceDetailModal
          record={selectedDetailRecord}
          asset={assets.find(a => a.id === selectedDetailRecord.assetId)}
          currentUser={currentUser}
          onUpdate={(updated) => {
            if (onUpdateTicket) onUpdateTicket(updated);
            setSelectedDetailRecord(null);
          }}
          onClose={() => setSelectedDetailRecord(null)}
        />
      )}

      {/* ASSET HISTORY MODAL (File 6) */}
      {historyAsset && (
        <AssetMaintenanceHistoryModal
          asset={historyAsset}
          records={maintenances}
          onNewTicketForAsset={(ast) => {
            setHistoryAsset(null);
            setShowCreateModal(true);
          }}
          onClose={() => setHistoryAsset(null)}
        />
      )}

      {/* REPAIRS SUMMARY MODAL (File 10) */}
      {showRepairsSummary && (
        <RepairsSummaryModal
          stats={repairsSummaryStats}
          onClose={() => setShowRepairsSummary(false)}
        />
      )}
    </div>
  );
};
