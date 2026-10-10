import React, { useState } from 'react';
import { BudgetAllocation, Organization } from '../types';
import { PieChart as PieIcon, DollarSign, TrendingUp, Calculator, ArrowRight } from 'lucide-react';

interface BudgetPanelProps {
  currentOrg: Organization;
  budgets: BudgetAllocation[];
}

export const BudgetPanel: React.FC<BudgetPanelProps> = ({
  currentOrg,
  budgets
}) => {
  const [calcCost, setCalcCost] = useState(5000);
  const [calcSalvage, setCalcSalvage] = useState(500);
  const [calcYears, setCalcYears] = useState(4);
  const [method, setMethod] = useState<'STRAIGHT_LINE' | 'DECLINING_BALANCE'>('STRAIGHT_LINE');

  const orgBudgets = budgets.filter(b => b.orgId === currentOrg.id);
  const totalAllocated = orgBudgets.reduce((a, b) => a + b.allocated, 0);
  const totalSpent = orgBudgets.reduce((a, b) => a + b.spent, 0);
  const remaining = totalAllocated - totalSpent;

  // Depreciation calculation formula
  const annualStraight = (calcCost - calcSalvage) / Math.max(calcYears, 1);
  const rateDeclining = 2 / Math.max(calcYears, 1); // Double declining rate

  const schedule: { year: number; start: number; dep: number; end: number }[] = [];
  let currBook = calcCost;
  for (let i = 1; i <= calcYears; i++) {
    const start = currBook;
    let dep = method === 'STRAIGHT_LINE' ? annualStraight : currBook * rateDeclining;
    if (currBook - dep < calcSalvage) dep = Math.max(currBook - calcSalvage, 0);
    const end = Math.max(currBook - dep, calcSalvage);
    schedule.push({ year: i, start: Math.round(start), dep: Math.round(dep), end: Math.round(end) });
    currBook = end;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-indigo-400" />
            <span>Fiscal Year IT Budget & Forecasting</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">Monitor departmental procurement allocations and simulate multi-year hardware depreciation schedules.</p>
        </div>

        <div className="flex items-center space-x-4 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-xs">
          <div><span className="text-slate-500 block">Total Budget</span><span className="text-white font-bold">${totalAllocated.toLocaleString()}</span></div>
          <div className="h-6 w-px bg-slate-800" />
          <div><span className="text-slate-500 block">Remaining</span><span className="text-emerald-400 font-bold">${remaining.toLocaleString()}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Departmental Allocations Table */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Department Budget Ledger (FY 2026)</span>
              <span className="text-[10px] text-emerald-400/90 font-mono">Fiscal Allocations</span>
            </div>

            <div className="space-y-4">
              {orgBudgets.map(b => {
                const pct = Math.min(Math.round((b.spent / b.allocated) * 100), 100);
                return (
                  <div key={b.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                      <span>{b.departmentName}</span>
                      <span className="font-mono text-emerald-400">${b.spent.toLocaleString()} / ${b.allocated.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2">
                      <span>Branch: {b.branchName}</span>
                      <span>{pct}% Utilized</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-500 ${pct > 85 ? 'bg-rose-500' : pct > 65 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <span>Q3 Hardware Refresh Procurement forecasted within budget threshold.</span>
            </div>
          </div>
        </div>

        {/* Interactive Depreciation Simulator */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Asset Depreciation Simulator</span>
              </div>
              <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px] font-semibold">
                <button
                  onClick={() => setMethod('STRAIGHT_LINE')}
                  className={`px-2 py-1 rounded-md transition-colors ${method === 'STRAIGHT_LINE' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  Straight Line
                </button>
                <button
                  onClick={() => setMethod('DECLINING_BALANCE')}
                  className={`px-2 py-1 rounded-md transition-colors ${method === 'DECLINING_BALANCE' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  Declining Bal.
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Asset Cost ($)</label>
                <input type="number" value={calcCost} onChange={e => setCalcCost(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono" />
              </div>
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Salvage Value ($)</label>
                <input type="number" value={calcSalvage} onChange={e => setCalcSalvage(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono" />
              </div>
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Useful Life (Yrs)</label>
                <input type="number" value={calcYears} onChange={e => setCalcYears(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono" />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-[11px] font-mono">
                <thead className="bg-slate-900 text-slate-400 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Year</th>
                    <th className="p-2.5">Start Book ($)</th>
                    <th className="p-2.5 text-rose-400">Depreciation ($)</th>
                    <th className="p-2.5 text-emerald-400">End Book ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {schedule.map(s => (
                    <tr key={s.year} className="hover:bg-slate-900/50">
                      <td className="p-2.5 font-bold">Year {s.year}</td>
                      <td className="p-2.5">${s.start.toLocaleString()}</td>
                      <td className="p-2.5 text-rose-300">-${s.dep.toLocaleString()}</td>
                      <td className="p-2.5 text-emerald-300 font-bold">${s.end.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Method: {method === 'STRAIGHT_LINE' ? 'Equal annual deduction' : 'Accelerated early depreciation'}</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1"><span>Depreciation Ledger</span><ArrowRight className="w-3 h-3" /></span>
          </div>
        </div>
      </div>
    </div>
  );
};
