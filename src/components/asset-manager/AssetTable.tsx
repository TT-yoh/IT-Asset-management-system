import React from 'react';
import { Asset, User } from '../../types';
import { 
  Eye, 
  Edit3, 
  Trash2, 
  QrCode, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  User as UserIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export type AssetSortKey =
  | 'assetCode'
  | 'name'
  | 'branchName'
  | 'assignedToUserName'
  | 'status'
  | 'condition'
  | 'currentValue';

interface AssetTableProps {
  assets: Asset[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onViewDetails: (asset: Asset) => void;
  onEditAsset?: (asset: Asset) => void;
  onDeleteAsset?: (id: string) => void;
  onShowQR: (asset: Asset) => void;
  /** True when every asset matching the current filters (all pages) is selected. */
  allSelected?: boolean;
  /** Number of assets matching the current filters across all pages. */
  totalCount?: number;
  sortKey?: AssetSortKey | null;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: AssetSortKey) => void;
}

export const AssetTable: React.FC<AssetTableProps> = ({
  assets,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onViewDetails,
  onEditAsset,
  onDeleteAsset,
  onShowQR,
  allSelected,
  totalCount,
  sortKey = null,
  sortDir = 'asc',
  onSort
}) => {
  const getStatusBadge = (status: Asset['status']) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> ACTIVE
          </span>
        );
      case 'REPAIR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> REPAIR
          </span>
        );
      case 'DAMAGED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> DAMAGED
          </span>
        );
      case 'DEPRECATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-700 text-slate-300 border border-slate-600">
            DEPRECATED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  const isAllSelected = allSelected ?? (assets.length > 0 && assets.every(a => selectedIds.has(a.id)));
  const selectAllCount = totalCount ?? assets.length;

  const renderSortButton = (label: string, key: AssetSortKey) => {
    const active = sortKey === key;
    const SortIcon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    if (!onSort) return <span>{label}</span>;
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 font-medium cursor-pointer hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
          active ? 'text-emerald-400' : ''
        }`}
      >
        {label}
        <SortIcon className={`w-3 h-3 ${active ? '' : 'opacity-50'}`} aria-hidden="true" />
      </button>
    );
  };

  /** A column that shows two values stacked (e.g. code above name) and can sort by either. */
  const renderHeader = (label: string, key: AssetSortKey, align: 'left' | 'right' = 'left', second?: { label: string; key: AssetSortKey }) => {
    const keys = second ? [key, second.key] : [key];
    const activeKey = keys.find(k => k === sortKey);
    return (
      <th
        scope="col"
        aria-sort={activeKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`p-2.5 xl:p-3 ${align === 'right' ? 'text-right' : ''}`}
      >
        <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${align === 'right' ? 'justify-end' : ''}`}>
          {renderSortButton(label, key)}
          {second && (
            <>
              <span className="text-slate-600" aria-hidden="true">/</span>
              {renderSortButton(second.label, second.key)}
            </>
          )}
        </span>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-xl">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-medium">
            <th scope="col" className="p-2.5 xl:p-3 w-10 text-center">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={onSelectAll}
                aria-label={`Select all ${selectAllCount} matching assets`}
                className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500/20 cursor-pointer accent-emerald-500"
              />
            </th>
            {renderHeader('Code', 'assetCode', 'left', { label: 'Device', key: 'name' })}
            {renderHeader('Branch Facility', 'branchName')}
            {renderHeader('Custodian', 'assignedToUserName')}
            {renderHeader('Status', 'status', 'left', { label: 'Condition', key: 'condition' })}
            {renderHeader('Valuation', 'currentValue', 'right')}
            <th scope="col" className="p-2.5 xl:p-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {assets.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-8 text-center text-slate-500">
                No assets found matching current criteria.
              </td>
            </tr>
          ) : (
            assets.map((asset) => {
              const isSelected = selectedIds.has(asset.id);

              return (
                <tr
                  key={asset.id}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    isSelected ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <td className="p-2.5 xl:p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(asset.id)}
                      aria-label={`Select ${asset.assetCode}`}
                      className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500/20 cursor-pointer accent-emerald-500"
                    />
                  </td>

                  <td className="p-2.5 xl:p-3">
                    <div className="font-mono font-bold text-[11px] text-emerald-400">{asset.assetCode}</div>
                    <div className="font-semibold text-slate-100">{asset.name || 'Hardware Asset'}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {asset.model && asset.model !== asset.name ? `${asset.model} • ` : ''}
                      {asset.imeiNumber ? (
                        <span className="text-emerald-400">IMEI: {asset.imeiNumber}</span>
                      ) : asset.macAddress ? (
                        <span className="text-cyan-400">MAC: {asset.macAddress}</span>
                      ) : asset.serialNumber && !asset.serialNumber.toLowerCase().startsWith('sn-ast') && !asset.serialNumber.toLowerCase().startsWith('sn-bulk') ? (
                        <span>S/N: {asset.serialNumber}</span>
                      ) : (
                        <span className="text-slate-500">Asset Tag Tracked</span>
                      )}
                      {asset.phoneNumber && (
                        <span className="text-slate-400 ml-1.5">• Line: {asset.phoneNumber}</span>
                      )}
                    </div>
                  </td>

                  <td className="p-2.5 xl:p-3 text-slate-300">
                    <div className="font-medium">{asset.branchName || 'Unassigned'}</div>
                    <div className="text-[10px] text-slate-500">{asset.categoryName || 'Hardware'}</div>
                  </td>

                  <td className="p-2.5 xl:p-3">
                    {asset.assignedToUserName ? (
                      <div className="flex items-start gap-1.5 text-slate-200">
                        <div className="w-5 h-5 shrink-0 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                          {(asset.assignedToUserName || 'U').charAt(0)}
                        </div>
                        {/* Long names wrap rather than widen the table (or get cut off). */}
                        <span className="leading-tight break-words min-w-0 max-w-[9rem]">{asset.assignedToUserName}</span>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[11px] italic">In storage</span>
                    )}
                  </td>

                  <td className="p-2.5 xl:p-3">
                    {getStatusBadge(asset.status)}
                    <div className="mt-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                        {asset.condition || 'GOOD'}
                      </span>
                    </div>
                  </td>

                  <td className="p-2.5 xl:p-3 text-right font-mono text-slate-200">
                    <div>${Number(asset.currentValue ?? asset.purchaseCost ?? 0).toLocaleString()}</div>
                    <div className="text-[10px] text-slate-500">
                      Cost: ${Number(asset.purchaseCost ?? 0).toLocaleString()}
                    </div>
                  </td>

                  <td className="p-2.5 xl:p-3">
                    {/* 2x2 on narrower screens so the actions never push the table sideways */}
                    <div className="grid grid-cols-2 gap-1 w-fit mx-auto xl:flex xl:items-center xl:justify-center">
                      <button
                        onClick={() => onViewDetails(asset)}
                        title="View Asset Details"
                        aria-label={`View details for ${asset.assetCode}`}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onShowQR(asset)}
                        title="View QR Code"
                        aria-label={`View QR code for ${asset.assetCode}`}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                      {onEditAsset && (
                        <button
                          onClick={() => onEditAsset(asset)}
                          title="Edit Asset"
                          aria-label={`Edit ${asset.assetCode}`}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-sky-400 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDeleteAsset && (
                        <button
                          onClick={() => onDeleteAsset(asset.id)}
                          title="Delete Asset"
                          aria-label={`Delete ${asset.assetCode}`}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
