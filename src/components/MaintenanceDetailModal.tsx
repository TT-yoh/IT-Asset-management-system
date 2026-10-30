import React, { useState } from 'react';
import { MaintenanceRecord, Asset, User, MaintenanceStatus } from '../types';
import { Wrench, AlertTriangle, Clock, CheckCircle2, History, DollarSign } from 'lucide-react';

interface MaintenanceDetailModalProps {
  record: MaintenanceRecord;
  asset?: Asset;
  currentUser: User;
  onUpdate: (updatedRecord: MaintenanceRecord) => void;
  onClose: () => void;
}

export const MaintenanceDetailModal: React.FC<MaintenanceDetailModalProps> = ({
  record,
  asset,
  currentUser,
  onUpdate,
  onClose
}) => {
  const [status, setStatus] = useState<MaintenanceStatus>(record.status);
  const [parts, setParts] = useState(record.partsReplaced || '');
  const [cost, setCost] = useState((record.cost || 0).toString());
  const [notes, setNotes] = useState(record.notes || '');
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'UPDATE' | 'AUDIT'>('DETAILS');
  const modalBodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (modalBodyRef.current) {
      modalBodyRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  const today = new Date().toISOString().split('T')[0]!;
  const isOverdue = record.status === 'IN_PROGRESS' && record.expectedCompletion < today;

  const handleSaveChanges = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    
    const newLog = {
      id: `aud-${Date.now()}`,
      timestamp: now,
      action: status === 'COMPLETED' ? 'MAINTENANCE_COMPLETED' : 'MAINTENANCE_UPDATED',
      user: currentUser.fullName,
      details: `Status set to ${status}. Cost logged: $${cost}. Parts: ${parts || 'None'}.`
    };

    const updated: MaintenanceRecord = {
      ...record,
      status,
      partsReplaced: parts.trim(),
      cost: parseFloat(cost) || 0,
      notes: notes.trim(),
      actualCompletion: status === 'COMPLETED' ? (record.actualCompletion || today) : undefined,
      auditLogs: [...(record.auditLogs || []), newLog]
    };

    onUpdate(updated);
    setActiveTab('DETAILS');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Banner */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {asset?.image ? (
              <img src={asset.image} alt={asset.name} className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Wrench className="w-6 h-6" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">{record.assetCode}</span>
                <span className="text-xs font-bold text-slate-300">[{record.type}] Ticket</span>
              </div>
              <h3 className="text-base font-bold text-white mt-1">{record.assetName}</h3>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/80">✕</button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-900 px-4 pt-2 gap-2 overflow-x-auto">
          {[
            { id: 'DETAILS', label: '📋 Overview & Timeline' },
            { id: 'UPDATE', label: '⚙️ Technician Update Form' },
            { id: 'AUDIT', label: `🔍 Audit Logs (${(record.auditLogs?.length || 1)})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                activeTab === tab.id ? 'border-rose-500 text-rose-400 bg-slate-800/50 rounded-t-xl' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div ref={modalBodyRef} className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
          {activeTab === 'DETAILS' && (
            <div className="space-y-6">
              {isOverdue && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2.5 animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  <div>
                    <span className="font-bold block text-sm">Overdue Maintenance Alert</span>
                    <span className="text-xs text-rose-200">Expected completion was {record.expectedCompletion}. Please prioritize restoration.</span>
                  </div>
                </div>
              )}

              {/* Status Board */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div><span className="text-slate-500 block text-[10px]">Status</span><span className="text-amber-300 font-bold">{record.status}</span></div>
                <div><span className="text-slate-500 block text-[10px]">Priority</span><span className="text-rose-400 font-bold">{record.priority || 'MEDIUM'}</span></div>
                <div><span className="text-slate-500 block text-[10px]">Reported By</span><span className="text-slate-200">{record.reportedBy}</span></div>
                <div><span className="text-slate-500 block text-[10px]">Assigned Tech</span><span className="text-emerald-400">{record.assignedTechnician}</span></div>
              </div>

              {/* Description */}
              <div>
                <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-2">Diagnostic Findings & Issue Description</h4>
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-200 leading-relaxed text-sm">
                  {record.description}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-3">Lifecycle Timeline</h4>
                <div className="space-y-3 relative pl-6 border-l border-slate-800 ml-2">
                  <div className="relative">
                    <div className="absolute -left-[29px] top-1 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-slate-900" />
                    <span className="text-[10px] font-mono text-slate-500">{record.startDate}</span>
                    <p className="font-bold text-white">Ticket Created & Dispatched</p>
                    <p className="text-slate-400 text-[11px]">Reported by {record.reportedBy}</p>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-[29px] top-1 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-slate-900" />
                    <span className="text-[10px] font-mono text-slate-500">In Progress</span>
                    <p className="font-bold text-amber-300">Hardware Under Repair / Diagnostics</p>
                    <p className="text-slate-400 text-[11px]">Assigned to {record.assignedTechnician}</p>
                  </div>

                  <div className="relative">
                    <div className={`absolute -left-[29px] top-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                      record.status === 'COMPLETED' ? 'bg-emerald-500' : isOverdue ? 'bg-rose-500' : 'bg-slate-700'
                    }`} />
                    <span className="text-[10px] font-mono text-slate-500">ETA: {record.expectedCompletion}</span>
                    <p className={`font-bold ${record.status === 'COMPLETED' ? 'text-emerald-300' : isOverdue ? 'text-rose-400' : 'text-slate-400'}`}>
                      {record.status === 'COMPLETED' ? `Restored to Active on ${record.actualCompletion}` : isOverdue ? 'Target Deadline Overdue' : 'Scheduled Restoration'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'UPDATE' && (
            <form onSubmit={handleSaveChanges} className="space-y-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 mb-2">
                Update work order status, log replacement parts inventory, and bill hardware repair expenses.
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Update Ticket Status *</label>
                <select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-bold">
                  <option value="PENDING">⏳ PENDING (Awaiting Parts / Bench Space)</option>
                  <option value="IN_PROGRESS">⚙️ IN PROGRESS (Active Bench Diagnostics)</option>
                  <option value="COMPLETED">✓ COMPLETED (Mark Restored & Return to Active Inventory)</option>
                  <option value="CANCELLED">✕ CANCELLED (Asset Deemed Unrepairable / Disposed)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Replacement Parts Used</label>
                <input type="text" placeholder="e.g. Replacement Cooling Fan SKU-8821, Thermal Paste" value={parts} onChange={e => setParts(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-600" />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Actual Total Labor & Parts Cost ($)</span>
                </label>
                <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold" />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Technician Log & Repair Notes</label>
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Bench test passes 100%. Thermal stress test validated..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-600" />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button type="button" onClick={() => setActiveTab('DETAILS')} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">Cancel</button>
                <button type="submit" className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Update & Publish Ticket</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'AUDIT' && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-rose-400" />
                <span>Immutable Audit Trail</span>
              </h4>

              {(record.auditLogs || [{
                id: 'init',
                timestamp: record.startDate + 'T09:00:00Z',
                action: 'MAINTENANCE_CREATED',
                user: record.reportedBy,
                details: `Initial ticket dispatched. Out-of-order alert recorded.`
              }]).map(log => (
                <div key={log.id} className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-rose-400 font-mono">{log.action}</span>
                    <span className="text-slate-500 font-mono text-[10px]">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-slate-200 text-xs">{log.details}</p>
                  <span className="text-[10px] text-slate-400 block font-mono">Executed by: {log.user}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Bottom Bar */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Target Deadline: {record.expectedCompletion}</span>
          </span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
