import React from 'react';
import { AssetStatus, Branch } from '../../types';
import { useFeedback } from '../../context/FeedbackContext';
import { 
  CheckSquare, 
  Trash2, 
  ArrowRightLeft, 
  Printer, 
  Layers, 
  X,
  CheckCircle2
} from 'lucide-react';

interface BatchActionToolbarProps {
  selectedCount: number;
  branches: Branch[];
  canEdit?: boolean;
  canDelete?: boolean;
  canWriteOff?: boolean;
  onBatchStatusChange: (status: AssetStatus, reason?: string) => void;
  onBatchTransferBranch: (branchId: string, branchName: string) => void;
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
  onBatchDelete,
  onBatchPrintLabels,
  onClearSelection
}) => {
  const { promptText } = useFeedback();
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-xl border border-emerald-500/40 shadow-2xl rounded-2xl p-3 sm:px-5 flex flex-wrap items-center gap-3 max-w-[95vw] sm:max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-200">
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
