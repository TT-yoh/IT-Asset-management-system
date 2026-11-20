import React, { useState } from 'react';
import { AssetStatus, Branch } from '../../types';
import { useFeedback } from '../../context/FeedbackContext';
import { 
  CheckSquare, 
  Trash2, 
  ArrowRightLeft, 
  Printer, 
  Layers, 
  X,
  CheckCircle2,
  DollarSign
} from 'lucide-react';

interface BatchActionToolbarProps {
  selectedCount: number;
  branches: Branch[];
  canEdit?: boolean;
  canDelete?: boolean;
  canWriteOff?: boolean;
  onBatchStatusChange: (status: AssetStatus, reason?: string) => void;
  onBatchTransferBranch: (branchId: string, branchName: string) => void;
  /** Set the purchase cost (and optionally the book value) of every selected asset. */
  onBatchSetCost?: (purchaseCost: number, alsoSetValue: boolean) => void;
  canSetValue?: boolean;
  onBatchDelete: () => void;
  onBatchPrintLabels: () => void;
  onClearSelection: () => void;
}

export const BatchActionToolbar: React.FC<BatchActionToolbarProps> = ({
  selectedCount,
  branches,
  canEdit = true,
  canDelete = false,
  canWriteOff = false,
  onBatchStatusChange,
  onBatchTransferBranch,
  onBatchSetCost,
  canSetValue = false,
  onBatchDelete,
  onBatchPrintLabels,
  onClearSelection
}) => {
  const { promptText } = useFeedback();
  const [costOpen, setCostOpen] = useState(false);
  const [costInput, setCostInput] = useState('');
  const [alsoSetValue, setAlsoSetValue] = useState(true);
  if (selectedCount === 0) return null;

  const costValue = Number(costInput);
  const costValid = costInput.trim() !== '' && Number.isFinite(costValue) && costValue >= 0;
  const submitCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!costValid || !onBatchSetCost) return;
    onBatchSetCost(Math.round(costValue * 100) / 100, alsoSetValue && canSetValue);
    setCostOpen(false);
    setCostInput('');
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-xl border border-emerald-500/40 shadow-2xl rounded-2xl p-3 sm:px-5 flex flex-wrap items-center gap-3 max-w-[95vw] sm:max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Set-cost panel: opens just above the toolbar */}
      {costOpen && onBatchSetCost && (
        <form
          onSubmit={submitCost}
          onKeyDown={(e) => { if (e.key === 'Escape') setCostOpen(false); }}
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[min(22rem,90vw)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 space-y-3 text-xs"
        >
          <div className="font-bold text-slate-100">
            Set cost for {selectedCount} asset{selectedCount === 1 ? '' : 's'}
          </div>
          <label className="block">
            <span className="text-slate-400">Purchase cost per asset ($)</span>
            <input
              autoFocus
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="e.g. 450"
              className="mt-1 w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </label>
          {canSetValue ? (
            <label className="flex items-start gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={alsoSetValue}
                onChange={(e) => setAlsoSetValue(e.target.checked)}
                className="mt-0.5 accent-emerald-500"
              />
              <span>Also set the current book value to this amount</span>
            </label>
          ) : (
            <p className="text-slate-500">Only the purchase cost is changed. Book values are set by administrators and finance.</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setCostOpen(false)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={!costValid} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              Set cost
            </button>
          </div>
        </form>
      )}
      <div className="flex items-center gap-2 border-r border-slate-700 pr-3">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
          {selectedCount}
        </div>
        <span className="text-xs font-semibold text-slate-200 whitespace-nowrap hidden sm:inline">
          Selected
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Status Dropdown */}
        {canEdit && (
          <select
            onChange={async (e) => {
              const select = e.target;
              const val = select.value as AssetStatus;
              if (val) {
                select.value = '';
                const isWriteOff = val === 'DEPRECATED' || val === 'SOLD' || val === 'DISPOSED';
                if (isWriteOff) {
                  const reason = await promptText({
                    title: `Write off ${selectedCount} asset${selectedCount === 1 ? '' : 's'} as ${val}?`,
                    message: 'A write-off reason is mandatory and is recorded in the audit log.',
                    inputLabel: 'Write-off reason',
                    confirmLabel: 'Write off',
                    tone: 'danger'
                  });
                  if (!reason) return;
                  onBatchStatusChange(val, reason);
                } else {
                  onBatchStatusChange(val);
                }
              }
            }}
            defaultValue=""
            className="px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="" disabled>Set Status...</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="REPAIR">REPAIR</option>
            <option value="DAMAGED">DAMAGED</option>
            {canWriteOff && (
              <>
                <option value="DEPRECATED">DEPRECATED (Write-off)</option>
                <option value="SOLD">SOLD (Write-off)</option>
                <option value="DISPOSED">DISPOSED (Write-off)</option>
              </>
            )}
          </select>
        )}

        {/* Branch Transfer Dropdown */}
        {canEdit && (
          <select
            onChange={(e) => {
              if (e.target.value) {
                const targetBranch = branches.find(b => b.id === e.target.value);
                if (targetBranch) {
                  onBatchTransferBranch(targetBranch.id, targetBranch.name);
                }
                e.target.value = '';
              }
            }}
            defaultValue=""
            className="px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="" disabled>Transfer Branch...</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}

        {/* Batch Set Cost */}
        {canEdit && onBatchSetCost && (
          <button
            type="button"
            onClick={() => setCostOpen(open => !open)}
            aria-expanded={costOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-700 cursor-pointer"
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span>Set Cost</span>
          </button>
        )}

        {/* Batch Label Print */}
        <button
          onClick={onBatchPrintLabels}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-700 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-emerald-400" />
          <span>Print Labels</span>
        </button>

        {/* Batch Delete */}
        {canDelete && (
          <button
            onClick={onBatchDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-medium transition-colors border border-rose-500/30 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        )}
      </div>

      <button
        onClick={onClearSelection}
        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors ml-auto"
        title="Clear Selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
