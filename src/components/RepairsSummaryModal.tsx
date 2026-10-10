import React from 'react';
import { RepairSummaryStats } from '../lib/maintenance-service';
import { Wrench, Clock, DollarSign, BarChart2, Users, PieChart } from 'lucide-react';

interface RepairsSummaryModalProps {
  stats: RepairSummaryStats;
  onClose: () => void;
}

export const RepairsSummaryModal: React.FC<RepairsSummaryModalProps> = ({
  stats,
  onClose
}) => {
  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <BarChart2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-rose-400 font-bold tracking-wider uppercase">Maintenance Intelligence Analytics</span>
              <h3 className="text-lg font-bold text-white mt-0.5 flex items-center gap-2">
                <span>Repairs & Maintenance Intelligence Dashboard</span>
              </h3>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/80">✕</button>
        </div>

        {/* 4 Top KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 bg-slate-900 border-b border-slate-800 text-xs">
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400"><Wrench className="w-5 h-5" /></div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-mono">Active Repairs</span>
              <span className="text-white font-mono font-bold text-lg">{stats.totalUnderRepair} Units</span>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400"><Clock className="w-5 h-5" /></div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-mono">Avg Turnaround</span>
              <span className="text-amber-300 font-mono font-bold text-lg">{stats.avgRepairDays} Days</span>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400"><DollarSign className="w-5 h-5" /></div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-mono">Month Cost</span>
              <span className="text-emerald-400 font-mono font-bold text-lg">${stats.totalCostThisMonth.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400"><PieChart className="w-5 h-5" /></div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-mono">Annualized Est</span>
              <span className="text-purple-300 font-mono font-bold text-lg">${Math.round(stats.totalCostYear).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Body Grid */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cost Trend Chart */}
            <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-rose-400" />
                <span>Monthly Repair Expenditure ($)</span>
              </h4>

              <div className="h-32 flex items-end justify-between gap-4 pt-6 px-2 border-b border-slate-800/80 pb-2">
                {stats.costTrend.map((t, i) => {
                  const maxCost = Math.max(...stats.costTrend.map(x => x.cost), 1000);
                  const pct = Math.min(100, Math.max(15, Math.round((t.cost / maxCost) * 100)));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                      <span className="text-[10px] font-mono text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity">${t.cost}</span>
                      <div className="w-full bg-rose-500/30 hover:bg-rose-500 rounded-t-md transition-all duration-300" style={{ height: `${pct}%` }} />
                      <span className="text-[10px] font-mono text-slate-500">{t.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Technician Workload */}
            <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Technician Workload & Output</span>
              </h4>

              <div className="space-y-3">
                {stats.technicianWorkload.map((tech, i) => (
                  <div key={i} className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">{tech.name}</span>
                      <span className="text-[10px] text-slate-400">Assigned hardware pool queue</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">{tech.activeTickets} Active</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{tech.completedTickets} Done</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Most Repaired Asset Categories */}
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
            <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              <span>Most Repaired Hardware Categories</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {stats.mostRepairedTypes.map((cat, i) => (
                <div key={i} className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-200 block text-sm">{cat.type}</span>
                    <span className="text-[10px] text-slate-500">{cat.count} Incident Tickets</span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-rose-400 font-bold block text-sm">${cat.totalCost}</span>
                    <span className="text-[9px] text-slate-500">Total bill</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
