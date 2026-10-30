import React from 'react';
import { Asset } from '../../types';
import { AssetCard } from '../AssetCard';

interface AssetGridProps {
  assets: Asset[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onViewDetails: (asset: Asset) => void;
  onEditAsset?: (asset: Asset) => void;
  onDeleteAsset?: (id: string) => void;
  onShowQR: (asset: Asset) => void;
}

export const AssetGrid: React.FC<AssetGridProps> = ({
  assets,
  selectedIds,
  onToggleSelect,
  onViewDetails,
  onEditAsset,
  onDeleteAsset,
  onShowQR
}) => {
  if (assets.length === 0) {
    return (
      <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-500">
        No hardware assets found matching the filter criteria.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {assets.map((asset) => (
        <div key={asset.id} className="relative group">
          <div className="absolute top-3 left-3 z-10">
            <input
              type="checkbox"
              checked={selectedIds.has(asset.id)}
              onChange={() => onToggleSelect(asset.id)}
              className="w-4 h-4 rounded bg-slate-900/80 border-slate-700 text-emerald-500 focus:ring-emerald-500/20 cursor-pointer accent-emerald-500 shadow-md"
            />
          </div>

          <AssetCard
            asset={asset}
            onSelect={() => onViewDetails(asset)}
            onEdit={onEditAsset ? () => onEditAsset(asset) : undefined}
            onDelete={onDeleteAsset ? () => onDeleteAsset(asset.id) : undefined}
            onShowQr={() => onShowQR(asset)}
          />
        </div>
      ))}
    </div>
  );
};
