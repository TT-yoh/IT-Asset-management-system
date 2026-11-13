import React, { useId, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { BudgetAllocation, Branch, Department } from '../types';
import type { BudgetInput } from '../lib/tidb-storage';

interface BudgetAllocationFormProps {
  /** The budget being edited, or undefined to create a new one. */
  existing?: BudgetAllocation;
  departments: Department[];
  branches: Branch[];
  defaultFiscalYear: number;
  onCancel: () => void;
  /** Resolves true when the server saved the budget; the form then closes. */
  onSubmit: (input: BudgetInput) => Promise<boolean>;
}

const INPUT =
  'w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition';
const LABEL = 'block text-xs font-semibold text-slate-300 mb-1';

/**
 * Add or edit a departmental budget allocation. Changing the amount already spent requires a
 * reason, matching the server rule (the reason is written to the audit log).
 */
export const BudgetAllocationForm: React.FC<BudgetAllocationFormProps> = ({
  existing,
  departments,
  branches,
  defaultFiscalYear,
  onCancel,
  onSubmit
}) => {
  const isEdit = Boolean(existing);
  const ids = { dept: useId(), branch: useId(), year: useId(), allocated: useId(), spent: useId(), reason: useId(), title: useId() };

  const departmentNames = useMemo(() => {
    const names = departments.map(d => d.name);
    if (existing?.departmentName && !names.includes(existing.departmentName)) names.unshift(existing.departmentName);
    return names;
  }, [departments, existing]);
  const branchNames = useMemo(() => {
    const names = branches.map(b => b.name);
    if (existing?.branchName && !names.includes(existing.branchName)) names.unshift(existing.branchName);
    return names;
  }, [branches, existing]);

  const [departmentName, setDepartmentName] = useState(existing?.departmentName || departmentNames[0] || '');
  const [branchName, setBranchName] = useState(existing?.branchName || branchNames[0] || '');
  const [fiscalYear, setFiscalYear] = useState(String(existing?.fiscalYear || defaultFiscalYear));
  const [allocated, setAllocated] = useState(existing ? String(existing.allocated) : '');
  const [spent, setSpent] = useState(existing ? String(existing.spent) : '0');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const spentChanged = isEdit && Number(spent) !== Number(existing!.spent);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError('');

    const year = Number(fiscalYear);
    const allocatedNum = Number(allocated);
    const spentNum = Number(spent);
    if (!departmentName) return setError('Choose a department. Create one under Facilities & Departments first if the list is empty.');
    if (!branchName) return setError('Choose a branch.');
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return setError('Enter a fiscal year between 2000 and 2100.');
    if (allocated.trim() === '' || !Number.isFinite(allocatedNum) || allocatedNum < 0) return setError('Enter an allocated amount of 0 or more.');
    if (isEdit && (!Number.isFinite(spentNum) || spentNum < 0)) return setError('Amount spent must be 0 or more.');
    if (spentChanged && reason.trim().length < 3) return setError('Give a reason for changing the amount spent (at least 3 characters). It is recorded in the audit log.');

    setIsSaving(true);
    const saved = await onSubmit({
      departmentName,
      branchName,
      fiscalYear: year,
      allocated: allocatedNum,
      spent: isEdit ? spentNum : undefined,
      reason: spentChanged ? reason.trim() : undefined
    });
    setIsSaving(false);
    // On failure the reason is shown as a notification and the form stays open for correction.
    if (!saved) setError('The budget was not saved. See the message for the reason.');
  };

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex justify-center items-start sm:items-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !isSaving) onCancel(); }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ids.title}
        className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={ids.title} className="text-base font-bold text-white">
              {isEdit ? 'Edit Budget Allocation' : 'Add Budget Allocation'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              One allocation per department, branch and fiscal year.
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" data-modal-close className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={ids.dept} className={LABEL}>Department *</label>
            <select id={ids.dept} value={departmentName} onChange={e => setDepartmentName(e.target.value)} className={`${INPUT} cursor-pointer`} required>
              {departmentNames.length === 0 && <option value="">No departments yet</option>}
              {departmentNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.branch} className={LABEL}>Branch *</label>
            <select id={ids.branch} value={branchName} onChange={e => setBranchName(e.target.value)} className={`${INPUT} cursor-pointer`} required>
              {branchNames.length === 0 && <option value="">No branches yet</option>}
              {branchNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.year} className={LABEL}>Fiscal Year *</label>
            <input id={ids.year} type="number" min={2000} max={2100} step={1} value={fiscalYear} onChange={e => setFiscalYear(e.target.value)} className={`${INPUT} font-mono`} required />
          </div>
          <div>
            <label htmlFor={ids.allocated} className={LABEL}>Allocated Amount ($) *</label>
            <input id={ids.allocated} type="number" min={0} step="0.01" value={allocated} onChange={e => setAllocated(e.target.value)} placeholder="e.g. 25000" className={`${INPUT} font-mono`} required />
          </div>
          {isEdit && (
            <div>
              <label htmlFor={ids.spent} className={LABEL}>Amount Spent ($)</label>
              <input id={ids.spent} type="number" min={0} step="0.01" value={spent} onChange={e => setSpent(e.target.value)} className={`${INPUT} font-mono`} />
            </div>
          )}
        </div>

        {spentChanged && (
          <div>
            <label htmlFor={ids.reason} className={LABEL}>Reason for changing the amount spent *</label>
            <textarea id={ids.reason} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Invoice INV-2026-0412 for 3 replacement laptops" className={INPUT} required />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onClick={onCancel} disabled={isSaving} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} aria-busy={isSaving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 flex items-center gap-2">
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Budget'}
          </button>
        </div>
      </form>
    </div>
  );
};
