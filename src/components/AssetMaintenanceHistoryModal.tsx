import React from 'react';
import { MaintenanceRecord, Asset } from '../types';
import { Wrench, History, Plus, BarChart3 } from 'lucide-react';

interface AssetMaintenanceHistoryModalProps {
  asset: Asset;
  records: MaintenanceRecord[];
  onNewTicketForAsset: (asset: Asset) => void;
  onClose: () => void;
}

export const AssetMaintenanceHistoryModal: React.FC<AssetMaintenanceHistoryModalProps> = ({
  asset,
  records,
  onNewTicketForAsset,
  onClose
}) => {
  const assetRecords = records.filter(r => r.assetId === asset.id);
  const totalCost = assetRecords.reduce((acc, r) => acc + (r.cost || 0), 0);

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Banner */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {asset.image ? (
              <img src={asset.image} alt={asset.name} className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-rose-400">
                <Wrench className="w-6 h-6" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">{asset.assetCode}</span>
                <span className="text-xs font-bold text-slate-400">{asset.category} • {asset.brand}</span>
              </div>
              <h3 className="text-base font-bold text-white mt-1">{asset.name} Maintenance History</h3>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/80">✕</button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 p-5 bg-slate-900 border-b border-slate-800 text-xs">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Total Work Orders</span>
            <span className="text-white font-bold text-base mt-1 block">{assetRecords.length} Tickets</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Total Repair Costs</span>
            <span className="text-rose-400 font-mono font-bold text-base mt-1 block">${totalCost.toLocaleString()}</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-mono">Current Condition</span>
              <span className="text-emerald-400 font-bold text-sm mt-1 block">{asset.condition}</span>
            </div>
            <button
              onClick={() => { onClose(); onNewTicketForAsset(asset); }}
              className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-lg shadow-rose-600/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>
          </div>
        </div>

        {/* Body Table & Chart simulation */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Simulated Chart */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-rose-400" />
              <span>Maintenance Frequency Over Time</span>
            </h4>
            <div className="h-20 flex items-end gap-3 pt-4 px-2 border-b border-slate-800 pb-2">
              {[
                { label: 'Q1 25', val: 10 },
                { label: 'Q2 25', val: 35 },
                { label: 'Q3 25', val: 20 },
                { label: 'Q4 25', val: 50 },
                { label: 'Q1 26', val: 30 },
                { label: 'Q2 26', val: assetRecords.length > 0 ? 70 : 15 }
              ].map((b, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="w-full bg-rose-500/40 hover:bg-rose-500 rounded-t transition-all group-hover:scale-105" style={{ height: `${b.val}%` }} />
                  <span className="text-[9px] font-mono text-slate-500">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-4 h-4 text-emerald-400" />
              <span>Work Order Log</span>
            </h4>

            {assetRecords.length === 0 ? (
              <div className="text-center py-10 bg-slate-950 rounded-xl border border-slate-800 text-slate-500">
                No past maintenance or breakdown records logged for this asset.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase font-mono text-slate-500 bg-slate-900/50">
                      <th className="p-3">Date</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Assigned To</th>
                      <th className="p-3 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                    {assetRecords.map(r => (
                      <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3 text-slate-400">{r.startDate}</td>
                        <td className="p-3"><span className="bg-slate-800 px-2 py-0.5 rounded text-rose-300 text-[10px]">{r.type}</span></td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            r.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 font-sans text-emerald-400 truncate max-w-[150px]">{r.assignedTechnician}</td>
                        <td className="p-3 text-right font-bold text-white">${(r.cost || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
