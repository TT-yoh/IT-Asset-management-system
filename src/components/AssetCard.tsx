import React from 'react';
import { Asset, User } from '../types';
import { 
  Laptop, 
  Server, 
  Smartphone, 
  HardDrive, 
  Wrench, 
  ArrowRight, 
  UserCheck, 
  ShieldAlert, 
  DollarSign, 
  Phone, 
  Mail,
  QrCode,
  CheckCircle2,
  Trash2,
  Edit3
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { generateSketchGraph } from './AssetManager';

interface AssetCardProps {
  asset: Asset;
  currentUser?: User;
  onSelect?: () => void;
  onViewDetail?: (asset: Asset) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onShowQr?: () => void;
  onQuickCheckout?: (asset: Asset) => void;
  onQuickEdit?: (asset: Asset) => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  currentUser,
  onSelect,
  onViewDetail,
  onEdit,
  onDelete,
  onShowQr,
  onQuickCheckout,
  onQuickEdit
}) => {
  const handleSelect = () => {
    if (onSelect) onSelect();
    else if (onViewDetail) onViewDetail(asset);
  };

  const getCategoryIcon = (catName: string) => {
    const lower = (catName || '').toLowerCase();
    if (lower.includes('server')) return <Server className="w-4 h-4 text-purple-400" />;
    if (lower.includes('mobile') || lower.includes('phone') || lower.includes('tablet')) return <Smartphone className="w-4 h-4 text-emerald-400" />;
    if (lower.includes('network') || lower.includes('switch')) return <HardDrive className="w-4 h-4 text-sky-400" />;
    return <Laptop className="w-4 h-4 text-emerald-400" />;
  };

  // Unified plain-language status mapping
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return {
          label: asset.assignedToUserName ? 'In Custody' : 'Available',
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        };
      case 'REPAIR':
        return {
          label: 'In Repair',
          color: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
        };
      case 'DAMAGED':
        return {
          label: 'Reported Issue',
          color: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        };
      case 'DEPRECATED':
        return {
          label: 'Retired / Replaced',
          color: 'bg-slate-800 text-slate-400 border-slate-700'
        };
      default:
        return {
          label: status,
          color: 'bg-sky-500/10 text-sky-400 border-sky-500/30'
        };
    }
  };

  const statusInfo = getStatusDisplay(asset.status);
  const imageSrc = asset.imageUrl || generateSketchGraph(asset.categoryName || '', asset.name || 'Hardware');

  return (
    <div className="group bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-lg transition hover:border-emerald-500/50 hover:shadow-emerald-500/10 flex flex-col justify-between">
      {/* Image / CAD Schematic Banner */}
      <div className="relative h-44 w-full bg-slate-950 overflow-hidden cursor-pointer" onClick={handleSelect}>
        <img
          src={imageSrc}
          alt={asset.name || 'Hardware Asset'}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500 opacity-90 group-hover:opacity-100"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-85" />

        {/* Top Status & Category Badges */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border tracking-wide backdrop-blur-md shadow-sm ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-800/80 flex items-center gap-1.5 text-xs text-slate-300 font-mono shadow-sm">
          {getCategoryIcon(asset.categoryName || asset.category || '')}
          <span className="font-semibold">{asset.assetCode}</span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3
              onClick={handleSelect}
              className="font-bold text-slate-100 text-sm md:text-base group-hover:text-emerald-400 transition cursor-pointer line-clamp-1"
              title={asset.name}
            >
              {asset.name}
            </h3>
            <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg border shrink-0 ${
              asset.condition === 'NEW' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
              asset.condition === 'GOOD' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
              asset.condition === 'FAIR' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
              'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              {asset.condition}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 font-mono mt-1">
            <span className="truncate">{asset.model || asset.branchName}</span>
            <span className="text-slate-600">•</span>
            <span className="text-[11px] text-slate-400 truncate">
              {asset.branchName || `SN: ${asset.serialNumber}`}
            </span>
          </div>
        </div>

        {/* Financial & Assignment Stats */}
        <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/60">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block tracking-wider">
              Book Value
            </span>
            <span className="font-mono font-bold text-emerald-400 text-sm flex items-center mt-0.5">
              ${(asset.currentValue ?? asset.purchaseCost ?? 0).toLocaleString()}
            </span>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/60 overflow-hidden">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block tracking-wider">
              Custodian
            </span>
            <span className="font-medium text-slate-300 truncate block text-xs mt-1 flex items-center gap-1" title={asset.assignedToUserName || 'Available in Storage'}>
              <UserCheck className="w-3 h-3 text-sky-400 shrink-0" />
              <span className="truncate">{asset.assignedToUserName || 'Available in Storage'}</span>
            </span>
          </div>
        </div>

        {/* Action Bar */}
        <div className="pt-1 flex items-center gap-1.5">
          <button
            onClick={handleSelect}
            className="flex-1 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>View Details</span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
          </button>

          {onShowQr && (
            <button
              onClick={onShowQr}
              className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 border border-slate-800 rounded-xl text-xs transition"
              title="Show QR Code"
            >
              <QrCode className="w-3.5 h-3.5" />
            </button>
          )}

          {onEdit && (
            <button
              onClick={onEdit}
              className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center justify-center shadow-sm"
              title="Edit Asset"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}

          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs transition flex items-center justify-center"
              title="Delete Asset"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
