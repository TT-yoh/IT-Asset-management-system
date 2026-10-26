import React from 'react';
import { MaintenanceRecord, Asset } from '../types';
import { Wrench, AlertTriangle, Clock, ChevronRight } from 'lucide-react';

interface MaintenanceCardProps {
  record: MaintenanceRecord;
  asset?: Asset;
  onViewDetail: (record: MaintenanceRecord) => void;
  onQuickComplete: (recordId: string) => void;
}

export const MaintenanceCard: React.FC<MaintenanceCardProps> = ({
  record,
  asset,
  onViewDetail,
  onQuickComplete
}) => {
  const today = new Date().toISOString().split('T')[0]!;
  const isOverdue = record.status === 'IN_PROGRESS' && !!record.expectedCompletion && record.expectedCompletion < today;

  // Calculate days difference
  const getDaysText = () => {
    if (record.status === 'COMPLETED') return 'Completed on time';
    if (!record.expectedCompletion) return 'Date pending';
    const d1 = new Date().getTime();
    const d2 = new Date(record.expectedCompletion).getTime();
    if (isNaN(d2)) return 'Date pending';
    const diffDays = Math.ceil((d2 - d1) / (1000 * 3600 * 24));
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue!`;
    if (diffDays === 0) return `Due today`;
    return `${diffDays} days left`;
  };

  const getStatusColor = () => {
    switch (record.status) {
      case 'COMPLETED': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'IN_PROGRESS': return isOverdue ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'PENDING': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  const getTypeBadgeColor = () => {
    switch (record.type) {
      case 'REPAIR': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'PREVENTIVE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'UPGRADE': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'INSPECTION': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  const priorityColor = () => {
    switch (record.priority) {
      case 'HIGH': return 'text-rose-400 font-bold';
      case 'MEDIUM': return 'text-amber-400 font-medium';
      case 'LOW': return 'text-slate-400';
      default: return 'text-amber-400 font-medium';
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl transition-all duration-200 flex flex-col justify-between relative overflow-hidden group">
      {/* Side status bar indicator */}
      <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${
        record.status === 'COMPLETED' ? 'bg-emerald-500' :
        isOverdue ? 'bg-rose-500' : 'bg-amber-500'
      }`} />

      <div>
        {/* Header with image thumbnail & code */}
        <div className="flex items-start justify-between gap-3 pl-2">
          <div className="flex items-center gap-3 min-w-0">
            {(asset?.imageUrl || (asset as any)?.image) ? (
              <img
                src={asset?.imageUrl || (asset as any)?.image}
                alt={asset?.name || record.assetName}
                className="w-10 h-10 rounded-xl object-cover border border-slate-700 bg-slate-950 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-rose-400 shrink-0">
                <Wrench className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono font-bold bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 border border-slate-700">{record.assetCode}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${getTypeBadgeColor()}`}>{record.type}</span>
              </div>
              <h4 className="text-sm font-bold text-white mt-1 line-clamp-1" title={record.assetName}>{record.assetName}</h4>
            </div>
          </div>

          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap shrink-0 ${getStatusColor()}`}>
            {record.status.replace('_', ' ')}
          </span>
        </div>

        {/* Description box */}
        <div className="mt-3.5 pl-2">
          <p className="text-xs text-slate-300 bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl line-clamp-2 leading-relaxed">
            {record.description}
          </p>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-2 mt-4 pl-2 text-[11px]">
          <div>
            <span className="text-slate-500 block text-[10px]">Assigned Tech</span>
            <span className="text-emerald-400 font-medium truncate block">{record.assignedTechnician}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Priority</span>
            <span className={priorityColor()}>{record.priority || 'MEDIUM'} Priority</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Reported By</span>
            <span className="text-slate-300 truncate block">{record.reportedBy}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Repair Est. Cost</span>
            <span className="text-white font-mono font-bold">${(record.cost || 0).toLocaleString()}</span>
          </div>
        </div>

        {/* Parts Replaced indicator */}
        {record.partsReplaced && (
          <div className="mt-3 pl-2 text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
            <Wrench className="w-3 h-3 text-amber-400" />
            <span className="truncate">Parts: {record.partsReplaced}</span>
          </div>
        )}
      </div>

      {/* Footer / Actions */}
      <div className="mt-5 pt-3 pl-2 border-t border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px]">
          {isOverdue ? (
            <span className="text-rose-400 font-bold flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{getDaysText()} (ETA: {record.expectedCompletion})</span>
            </span>
          ) : (
            <span className="text-slate-400 flex items-center gap-1 font-mono text-[10px]">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{getDaysText()} • ETA: {record.expectedCompletion}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {record.status === 'IN_PROGRESS' && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuickComplete(record.id); }}
              className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] transition-all shadow-md shadow-emerald-500/10"
            >
              Complete
            </button>
          )}
          <button
            onClick={() => onViewDetail(record)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] flex items-center gap-1 transition-all"
          >
            <span>View</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
