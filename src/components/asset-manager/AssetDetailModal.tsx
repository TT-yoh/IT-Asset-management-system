import React, { useState } from 'react';
import { Asset } from '../../types';
import { 
  X, 
  QrCode, 
  Calendar, 
  DollarSign, 
  ShieldCheck, 
  Wrench, 
  User, 
  Layers, 
  MapPin, 
  Cpu, 
  Printer, 
  Edit3, 
  Clock, 
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Tag
} from 'lucide-react';
import { generateSketchGraph } from '../AssetManager';

interface AssetDetailModalProps {
  asset: Asset | null;
  onClose: () => void;
  onEdit?: (asset: Asset) => void;
  onReportRepair?: (asset: Asset) => void;
  onPrintLabel?: (asset: Asset) => void;
}

export const AssetDetailModal: React.FC<AssetDetailModalProps> = ({
  asset,
  onClose,
  onEdit,
  onReportRepair,
  onPrintLabel
}) => {
  const [showTechnicalSpecs, setShowTechnicalSpecs] = useState<boolean>(false);
  const [showQrPreview, setShowQrPreview] = useState<boolean>(false);

  if (!asset) return null;

  const origin = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('null')
    ? window.location.origin
    : 'https://it-asset-management-system-orpin.vercel.app';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    `${origin}/?asset=${encodeURIComponent(asset.assetCode)}`
  )}`;

  // Calculate straight-line depreciation
  const purchaseCost = asset.purchaseCost ?? 0;
  const pDate = new Date(asset.purchaseDate || '2024-01-01');
  const now = new Date();
  const ageMonths = Math.max(0, Math.floor((now.getTime() - pDate.getTime()) / (1000 * 3600 * 24 * 30.4375)));
  const totalUsefulMonths = 36;
  const depreciatedPct = Math.min(100, Math.round((ageMonths / totalUsefulMonths) * 100));
  const estimatedBookValue = Math.max(0, Math.round(purchaseCost * (1 - depreciatedPct / 100)));

  // Warranty status
  const wDate = asset.warrantyExpiry ? new Date(asset.warrantyExpiry) : null;
  const warrantyDaysLeft = wDate ? Math.ceil((wDate.getTime() - now.getTime()) / (1000 * 3600 * 24)) : null;

  const getFriendlyStatus = (status: Asset['status']) => {
    switch (status) {
      case 'ACTIVE':
        return { label: 'Ready for Use', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'REPAIR':
        return { label: 'In Repair', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'DAMAGED':
        return { label: 'Reported Damage', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };
      case 'DEPRECATED':
        return { label: 'Retired', color: 'bg-slate-800 text-slate-400 border-slate-700' };
      default:
        return { label: status, color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' };
    }
  };

  const statusDisplay = getFriendlyStatus(asset.status);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex items-start justify-between">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 p-1 flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src={asset.imageUrl || generateSketchGraph(asset.categoryName || '', asset.name)}
                alt={asset.name}
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-100">{asset.name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {asset.assetCode}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusDisplay.color}`}>
                  {statusDisplay.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <span>{asset.branchName}</span>
                <span className="text-slate-600">•</span>
                <span>{asset.categoryName || 'Hardware'}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Key Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Condition</span>
              <div className="text-sm font-bold text-slate-200 mt-0.5">{asset.condition}</div>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Current Value</span>
              <div className="text-sm font-black font-mono text-emerald-400 mt-0.5">
                ${(asset.currentValue ?? estimatedBookValue).toLocaleString()}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Original Cost</span>
              <div className="text-sm font-bold font-mono text-slate-300 mt-0.5">
                ${purchaseCost.toLocaleString()}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Warranty</span>
              <div className="text-sm font-bold text-slate-200 mt-0.5">
                {warrantyDaysLeft !== null ? (
                  warrantyDaysLeft > 0 ? (
                    <span className="text-emerald-400">{warrantyDaysLeft}d left</span>
                  ) : (
                    <span className="text-rose-400">Expired</span>
                  )
                ) : (
                  'Active'
                )}
              </div>
            </div>
          </div>

          {/* Current Custodian & Location */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-200 text-sm">
                  {asset.assignedToUserName || 'Available in Storage'}
                </div>
                <div className="text-slate-400 text-xs mt-0.5">
                  Assigned Location: {asset.branchName} {asset.assignedAt && `• Checked out on ${asset.assignedAt}`}
                </div>
              </div>
            </div>

            <span className={`px-2.5 py-1 rounded-xl text-xs font-semibold ${
              asset.assignedToUserName ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
            }`}>
              {asset.assignedToUserName ? 'In Staff Custody' : 'Ready for Reassignment'}
            </span>
          </div>

          {/* Depreciation Progress */}
          <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-2xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300 font-semibold">Estimated Depreciation (36-Month Useful Life)</span>
              <span className="text-slate-400 font-mono font-medium">{depreciatedPct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 rounded-full"
                style={{ width: `${depreciatedPct}%` }}
              />
            </div>
          </div>

          {/* Progressive Disclosure: Collapsible Technical & Network Details */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTechnicalSpecs(!showTechnicalSpecs)}
              className="w-full p-3.5 bg-slate-950/60 hover:bg-slate-950 text-xs font-semibold text-slate-300 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Technical Specs, MAC, Serial & Network Attributes
              </span>
              {showTechnicalSpecs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showTechnicalSpecs && (
              <div className="p-4 bg-slate-950/90 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs animate-in fade-in duration-150">
                <div>
                  <span className="text-slate-500 text-[10px] block">Model Identifier:</span>
                  <span className="text-slate-200 font-sans">{asset.model || asset.name}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Serial Number:</span>
                  <span className="text-slate-200">{asset.serialNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">MAC Address:</span>
                  <span className="text-slate-200">{asset.macAddress || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">IMEI / Network:</span>
                  <span className="text-slate-200">{asset.imeiNumber || 'N/A'}</span>
                </div>
                {asset.notes && (
                  <div className="sm:col-span-2 pt-2 border-t border-slate-800 text-[11px] font-sans text-slate-400">
                    <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">Hardware Profile:</span>
                    {asset.notes}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* QR Tag Inspection Drawer */}
          {showQrPreview && (
            <div className="p-4 bg-white text-slate-900 rounded-2xl flex flex-col items-center justify-center space-y-2 animate-in fade-in duration-150">
              <img src={qrUrl} alt={asset.assetCode} className="w-36 h-36" />
              <span className="font-mono font-bold text-xs">{asset.assetCode}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onPrintLabel && (
              <button
                onClick={() => onPrintLabel(asset)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors border border-slate-700 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Print Label</span>
              </button>
            )}

            <button
              onClick={() => setShowQrPreview(!showQrPreview)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors border border-slate-700 cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">{showQrPreview ? 'Hide QR' : 'View QR'}</span>
            </button>

            {onReportRepair && asset.status !== 'REPAIR' && (
              <button
                onClick={() => onReportRepair(asset)}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl text-xs font-semibold transition-colors border border-amber-500/30 cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Report Issue</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(asset)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
