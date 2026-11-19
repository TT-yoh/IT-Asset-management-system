import React, { useEffect, useMemo, useState } from 'react';
import { Briefcase, Building2, Laptop, Search, X } from 'lucide-react';
import { Asset, AssetStatus } from '../../types';

interface LocationAssetsModalProps {
  /** What was clicked: a facility (branch) or a department. */
  kind: 'facility' | 'department';
  title: string;
  subtitle?: string;
  assets: Asset[];
  onClose: () => void;
}

const STATUS_STYLES: Record<AssetStatus, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  REPAIR: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  DAMAGED: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  DEPRECATED: 'bg-slate-700/40 text-slate-400 border-slate-600',
  SOLD: 'bg-slate-700/40 text-slate-400 border-slate-600',
  DISPOSED: 'bg-slate-700/40 text-slate-400 border-slate-600'
};

/** Lists the devices at a facility or held by a department, with search and status filter. */
export const LocationAssetsModal: React.FC<LocationAssetsModalProps> = ({ kind, title, subtitle, assets, onClose }) => {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AssetStatus | 'ALL'>('ALL');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const statusCounts = useMemo(() => {
    const counts = new Map<AssetStatus, number>();
    assets.forEach(a => counts.set(a.status, (counts.get(a.status) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const assignedCount = assets.filter(a => a.assignedToUserId).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets
      .filter(a => status === 'ALL' || a.status === status)
      .filter(a => !q || [a.assetCode, a.name, a.model, a.serialNumber, a.categoryName, a.assignedToUserName, a.branchName]
        .some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.assetCode || '').localeCompare(b.assetCode || ''));
  }, [assets, query, status]);

  const Icon = kind === 'facility' ? Building2 : Briefcase;
  const accent = kind === 'facility' ? 'text-emerald-400' : 'text-purple-400';

  return (
    <div
      data-modal-overlay
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Devices at ${title}`}
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
              <Icon className={`w-5 h-5 ${accent}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">{title}</h3>
              <p className="text-xs text-slate-400">
                {subtitle ? `${subtitle} · ` : ''}
                {assets.length} device{assets.length === 1 ? '' : 's'}
                {kind === 'facility' && ` · ${assignedCount} assigned, ${assets.length - assignedCount} in storage`}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & status filter */}
        {assets.length > 0 && (
          <div className="px-5 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search tag, device, serial or person..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setStatus('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${status === 'ALL' ? 'bg-slate-700 text-white border-slate-600' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'}`}
              >
                All {assets.length}
              </button>
              {statusCounts.map(([s, n]) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${status === s ? STATUS_STYLES[s] : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'}`}
                >
                  {s} {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Device list */}
        <div className="overflow-y-auto">
          {assets.length === 0 ? (
            <div className="py-16 text-center text-slate-500 px-6">
              <Laptop className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-300">No devices yet</div>
              <p className="text-xs mt-1">
                {kind === 'facility'
                  ? 'No assets are stationed at this facility.'
                  : 'Nobody in this department has an asset assigned.'}
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">No devices match your search.</div>
          ) : (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="sticky top-0 bg-slate-950 text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                <tr>
                  <th className="px-5 py-2.5">Device</th>
                  <th className="px-3 py-2.5">{kind === 'facility' ? 'Category' : 'Facility / Category'}</th>
                  <th className="px-3 py-2.5">Assigned To</th>
                  <th className="px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {visible.map(a => (
                  <tr key={a.id} className="hover:bg-slate-800/30">
                    <td className="px-5 py-2.5">
                      <div className="font-mono text-[11px] font-bold text-emerald-400">{a.assetCode}</div>
                      <div className="font-semibold text-slate-100">{a.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono break-all">
                        {[a.model && a.model !== a.name ? a.model : '', a.serialNumber ? `S/N ${a.serialNumber}` : ''].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {kind === 'department' && <div className="text-slate-300">{a.branchName}</div>}
                      <div className={kind === 'department' ? 'text-[10px] text-slate-500' : 'text-slate-300'}>{a.categoryName}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {a.assignedToUserName
                        ? <span className="text-slate-200">{a.assignedToUserName}</span>
                        : <span className="italic text-slate-500">In storage</span>}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLES[a.status] || STATUS_STYLES.DEPRECATED}`}>
                        {a.status}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-1">{a.condition}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
