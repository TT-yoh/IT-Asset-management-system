import React, { useState } from 'react';
import { BudgetAllocation, Branch, Department, Organization, User } from '../types';
import { PieChart as PieIcon, DollarSign, TrendingUp, Calculator, ArrowRight, AlertTriangle, Plus, Pencil, Trash2 } from 'lucide-react';
import { hasPermission } from '../../shared/permissions';
import { useFeedback } from '../context/FeedbackContext';
import { BudgetAllocationForm } from './BudgetAllocationForm';
import type { BudgetInput } from '../lib/tidb-storage';
import { calculateStraightLineDepreciation } from '../../shared/finance';

interface BudgetPanelProps {
  currentOrg: Organization;
  budgets: BudgetAllocation[];
  currentUser?: User | null;
  departments?: Department[];
  branches?: Branch[];
  onSaveBudget?: (input: BudgetInput, existing?: BudgetAllocation) => Promise<boolean>;
  onDeleteBudget?: (budget: BudgetAllocation) => Promise<boolean>;
}

export const BudgetPanel: React.FC<BudgetPanelProps> = ({
  currentOrg,
  budgets,
  currentUser,
  departments = [],
  branches = [],
  onSaveBudget,
  onDeleteBudget
}) => {
  const { confirm } = useFeedback();
  const canManage = Boolean(onSaveBudget) && hasPermission(currentUser?.role, 'budgets:manage');
  const [formTarget, setFormTarget] = useState<{ existing?: BudgetAllocation } | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [calcCost, setCalcCost] = useState(5000);
  const [calcSalvage, setCalcSalvage] = useState(500);
  const [calcYears, setCalcYears] = useState(4);
  const [method, setMethod] = useState<'STRAIGHT_LINE' | 'DECLINING_BALANCE'>('STRAIGHT_LINE');

  const allOrgBudgets = budgets.filter(b => b.orgId === currentOrg.id);
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from(new Set([currentYear, ...allOrgBudgets.map(b => b.fiscalYear)])).sort((a, b) => b - a);
  // Default to the current year if it has budgets, otherwise the most recent year that does.
  const defaultYear = allOrgBudgets.some(b => b.fiscalYear === currentYear)
    ? currentYear
    : (allOrgBudgets.map(b => b.fiscalYear).sort((a, b) => b - a)[0] ?? currentYear);
  const activeFiscalYear = selectedYear ?? defaultYear;
  const orgBudgets = allOrgBudgets.filter(b => b.fiscalYear === activeFiscalYear);
  const totalAllocated = orgBudgets.reduce((a, b) => a + (b.allocated || 0), 0);
  const totalSpent = orgBudgets.reduce((a, b) => a + (b.spent || 0), 0);
  const remaining = totalAllocated - totalSpent;
  const isOverspent = remaining < 0;

  const handleDelete = async (b: BudgetAllocation) => {
    if (!onDeleteBudget) return;
    const ok = await confirm({
      title: 'Remove this budget?',
      message: `The FY ${b.fiscalYear} budget for ${b.departmentName} (${b.branchName}) will be removed. The removal is recorded in the audit log.`,
      confirmLabel: 'Remove budget',
      tone: 'danger'
    });
    if (ok) await onDeleteBudget(b);
  };

  // Depreciation calculation using shared/finance.ts standard straight-line formulas
  const usefulLifeMonths = Math.max(1, calcYears * 12);
  const salvageFactor = calcCost > 0 ? Math.min(1, Math.max(0, calcSalvage / calcCost)) : 0.1;

  const schedule: { year: number; start: number; dep: number; end: number }[] = [];
  let currBook = calcCost;
  for (let i = 1; i <= calcYears; i++) {
    const start = currBook;
    let dep = 0;
    if (method === 'STRAIGHT_LINE') {
      const asOfDate = new Date(2000 + i, 0, 1);
      const prevDate = new Date(2000 + i - 1, 0, 1);
      const curRes = calculateStraightLineDepreciation(calcCost, new Date(2000, 0, 1), {
        usefulLifeMonths,
        salvageFactor,
        asOfDate
      });
      const prevRes = calculateStraightLineDepreciation(calcCost, new Date(2000, 0, 1), {
        usefulLifeMonths,
        salvageFactor,
        asOfDate: prevDate
      });
      dep = Math.max(0, curRes.accumulatedDepreciation - prevRes.accumulatedDepreciation);
    } else {
      const rateDeclining = 2 / Math.max(calcYears, 1);
      dep = currBook * rateDeclining;
      if (currBook - dep < calcSalvage) dep = Math.max(currBook - calcSalvage, 0);
    }
    const end = Math.max(currBook - dep, calcSalvage);
    schedule.push({ year: i, start: Math.round(start), dep: Math.round(dep), end: Math.round(end) });
    currBook = end;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {formTarget && onSaveBudget && (
        <BudgetAllocationForm
          existing={formTarget.existing}
          departments={departments}
          branches={branches}
          defaultFiscalYear={activeFiscalYear}
          onCancel={() => setFormTarget(null)}
          onSubmit={async (input) => {
            const saved = await onSaveBudget(input, formTarget.existing);
            if (saved) {
              setFormTarget(null);
              setSelectedYear(input.fiscalYear);
            }
            return saved;
          }}
        />
      )}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-indigo-400" />
            <span>Fiscal Year IT Budget &amp; Forecasting</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">Monitor departmental procurement allocations and simulate multi-year hardware depreciation schedules.</p>
        </div>

        <div className="flex items-center space-x-4 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-xs">
          <div><span className="text-slate-500 block">Total Budget</span><span className="text-white font-bold">${totalAllocated.toLocaleString()}</span></div>
          <div className="h-6 w-px bg-slate-800" />
          <div>
            <span className="text-slate-500 block">Remaining</span>
            <span className={`font-bold ${isOverspent ? 'text-rose-400' : 'text-emerald-400'}`}>
              {isOverspent ? `-$${Math.abs(remaining).toLocaleString()}` : `$${remaining.toLocaleString()}`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Departmental Allocations Table */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Department Budget Ledger (FY {activeFiscalYear})</span>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="budget-fiscal-year">Fiscal year</label>
                <select
                  id="budget-fiscal-year"
                  value={activeFiscalYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 cursor-pointer"
                >
                  {availableYears.map(y => <option key={y} value={y}>FY {y}</option>)}
                </select>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setFormTarget({})}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add Budget
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {orgBudgets.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/60 rounded-xl border border-dashed border-slate-800 space-y-3">
                  <p>No departmental budgets for FY {activeFiscalYear}.</p>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setFormTarget({})}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add the first budget
                    </button>
                  ) : (
                    <p>Ask an administrator or finance user to add budgets.</p>
                  )}
                </div>
              ) : (
                orgBudgets.map(b => {
                  const allocated = b.allocated || 0;
                  const spent = b.spent || 0;
                  const pct = allocated > 0 ? Math.min(Math.round((spent / allocated) * 100), 100) : 0;
                  return (
                    <div key={b.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                      <div className="flex items-center justify-between gap-2 text-xs font-bold text-white mb-1">
                        <span>{b.departmentName || 'General Department'}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-emerald-400">${spent.toLocaleString()} / ${allocated.toLocaleString()}</span>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => setFormTarget({ existing: b })}
                                aria-label={`Edit ${b.departmentName} budget`}
                                title="Edit budget"
                                className="p-1 rounded-md text-slate-400 hover:text-sky-300 hover:bg-slate-800"
                              >
                                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              {onDeleteBudget && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(b)}
                                  aria-label={`Remove ${b.departmentName} budget`}
                                  title="Remove budget"
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-300 hover:bg-slate-800"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2">
                        <span>Branch: {b.branchName || 'All Branches'}</span>
                        <span>{pct}% Utilized</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 ${pct > 85 ? 'bg-rose-500' : pct > 65 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className={`mt-6 p-3 rounded-xl border text-[11px] flex items-center justify-between ${
            isOverspent
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
          }`}>
            <div className="flex items-center gap-2">
              {isOverspent ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <TrendingUp className="w-4 h-4 text-indigo-400 shrink-0" />
              )}
              <span>
                {isOverspent
                  ? `Budget overspend detected: -$${Math.abs(remaining).toLocaleString()} deficit across active allocations.`
                  : totalAllocated > 0
                    ? `${((totalSpent / totalAllocated) * 100).toFixed(1)}% of total FY ${activeFiscalYear} allocation utilized ($${remaining.toLocaleString()} remaining balance).`
                    : 'No active budget allocations registered for this fiscal year.'}
              </span>
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
