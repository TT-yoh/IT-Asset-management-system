import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Asset, User, AssetStatus } from '../types';
import { 
  Camera, 
  X, 
  CheckCircle2, 
  ArrowRightLeft, 
  RotateCcw, 
  Wrench, 
  PlusCircle, 
  QrCode,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Cpu,
  MapPin,
  Sparkles,
  Search,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Calendar,
  DollarSign,
  Tag,
  AlertTriangle,
  Smartphone,
  Wifi,
  Laptop
} from 'lucide-react';
import { generateSketchGraph } from './AssetManager';

export interface QuickScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  currentUser: User;
  onSelectAssetForCheckout?: (asset: Asset) => void;
  onSelectAssetForReturn?: (asset: Asset) => void;
  onSelectAssetForRepair?: (asset: Asset) => void;
  onEnrollScannedTag?: (tagOrCode: string) => void;
  onUpdateAssetStatus?: (assetId: string, status: AssetStatus) => void;
  onViewAssetDetails?: (asset: Asset) => void;
}

/**
 * Universal Decoder: Resolves deep-link URLs, JSON payloads, Serial Numbers, 
 * IMEIs, MAC addresses, or raw Asset Codes from physical or camera scans.
 */
export function resolveAssetFromScan(rawScan: string, assets: Asset[]): { asset: Asset | null; extractedCode: string } {
  if (!rawScan || !rawScan.trim()) return { asset: null, extractedCode: '' };
  const trimmed = rawScan.trim();
  let candidateCode = trimmed;

  // 1. Deep check if payload is a URL (e.g. physical printed QR sticker or browser URL)
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('/?') || trimmed.includes('#/')) {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.com${trimmed.startsWith('/') ? '' : '/'}${trimmed}`);
      
      const paramAsset = url.searchParams.get('asset') || url.searchParams.get('code') || url.searchParams.get('id') || url.searchParams.get('tag');
      if (paramAsset) {
        candidateCode = paramAsset.trim();
      } else if (url.hash && url.hash.includes('?')) {
        const hashQuery = url.hash.substring(url.hash.indexOf('?'));
        const hashParams = new URLSearchParams(hashQuery);
        const hashAsset = hashParams.get('asset') || hashParams.get('code') || hashParams.get('id') || hashParams.get('tag');
        if (hashAsset) {
          candidateCode = hashAsset.trim();
        }
      }
    }
  } catch {}

  // 2. Check if payload is a JSON string (e.g. older sticker generations or diagnostic tools)
  try {
    const parsed = JSON.parse(candidateCode);
    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.code) candidateCode = String(parsed.code).trim();
      else if (parsed.assetCode) candidateCode = String(parsed.assetCode).trim();
      else if (parsed.sn) candidateCode = String(parsed.sn).trim();
      else if (parsed.serialNumber) candidateCode = String(parsed.serialNumber).trim();
      else if (parsed.imei) candidateCode = String(parsed.imei).trim();
      else if (parsed.id) candidateCode = String(parsed.id).trim();
    }
  } catch {}

  // 3. Match against asset inventory
  const cleanCandidate = candidateCode.trim().toLowerCase();
  const alphanumericOnly = cleanCandidate.replace(/[^a-z0-9]/gi, '');

  const matched = assets.find(a => {
    // Exact or case-insensitive match on assetCode
    if (a.assetCode && a.assetCode.toLowerCase() === cleanCandidate) return true;
    // Match on unique asset id
    if (a.id && a.id.toLowerCase() === cleanCandidate) return true;
    // Match on Serial Number
    if (a.serialNumber && a.serialNumber.toLowerCase() === cleanCandidate) return true;
    // Match on IMEI (numeric, min 8 digits)
    if (a.imeiNumber) {
      const cleanImei = a.imeiNumber.replace(/[^0-9]/g, '');
      if (cleanImei && cleanImei === alphanumericOnly && alphanumericOnly.length >= 8) return true;
    }
    // Match on MAC address (ignoring colons and hyphens)
    if (a.macAddress) {
      const cleanMac = a.macAddress.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (cleanMac && cleanMac === alphanumericOnly && alphanumericOnly.length >= 8) return true;
    }
    // Match on Phone line
    if (a.phoneNumber) {
      const cleanPhone = a.phoneNumber.replace(/[^0-9]/g, '');
      if (cleanPhone && cleanPhone === alphanumericOnly && alphanumericOnly.length >= 6) return true;
    }
    return false;
  });

  return { asset: matched || null, extractedCode: candidateCode };
}

export const QuickScannerModal: React.FC<QuickScannerModalProps> = ({
  isOpen,
  onClose,
  assets,
  currentUser,
  onSelectAssetForCheckout,
  onSelectAssetForReturn,
  onSelectAssetForRepair,
  onEnrollScannedTag,
  onUpdateAssetStatus,
  onViewAssetDetails
}) => {
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [matchedAsset, setMatchedAsset] = useState<Asset | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [manualInput, setManualInput] = useState<string>('');
  const [copiedTag, setCopiedTag] = useState<boolean>(false);
  const qrInstanceRef = useRef<Html5Qrcode | null>(null);

  // Pleasant audio synthesizer confirmation chime
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12); // A6 chime
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch {}

    // Subtle haptic vibration feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([80, 40, 80]);
    }
  };

  const handleScanResult = (decodedText: string) => {
    playBeep();
    setIsScanning(false);
    const { asset: found, extractedCode } = resolveAssetFromScan(decodedText, assets);
    setScannedCode(extractedCode || decodedText);
    setMatchedAsset(found);
  };

  useEffect(() => {
    if (!isOpen) {
      if (qrInstanceRef.current) {
        qrInstanceRef.current.stop().catch(() => {}).finally(() => {
          qrInstanceRef.current?.clear();
          qrInstanceRef.current = null;
        });
      }
      setScannedCode(null);
      setMatchedAsset(null);
      setIsScanning(true);
      setManualInput('');
      setCopiedTag(false);
      return;
    }

    const timer = setTimeout(() => {
      const html5Qr = new Html5Qrcode('quick-scanner-viewport');
      qrInstanceRef.current = html5Qr;

      html5Qr.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          handleScanResult(decodedText);
        },
        () => {}
      ).catch((err) => {
        console.warn('Camera initiation notice:', err);
      });
    }, 150);

    return () => {
      clearTimeout(timer);
      if (qrInstanceRef.current) {
        qrInstanceRef.current.stop().catch(() => {}).finally(() => {
          qrInstanceRef.current?.clear();
          qrInstanceRef.current = null;
        });
      }
    };
  }, [isOpen]);

  const handleResetScanner = () => {
    setScannedCode(null);
    setMatchedAsset(null);
    setIsScanning(true);
    setManualInput('');
    setCopiedTag(false);

    if (qrInstanceRef.current) {
      qrInstanceRef.current.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          handleScanResult(decodedText);
        },
        () => {}
      ).catch(() => {});
    }
  };

  const handleManualSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualInput.trim()) return;

    if (qrInstanceRef.current && isScanning) {
      qrInstanceRef.current.stop().catch(() => {});
    }

    handleScanResult(manualInput.trim());
  };

  const copyTagToClipboard = (tag: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(tag);
      setCopiedTag(true);
      setTimeout(() => setCopiedTag(false), 2000);
    }
  };

  const getFriendlyStatus = (asset: Asset) => {
    if (asset.assignedToUserName) {
      return { 
        label: `In Custody (${asset.assignedToUserName})`, 
        color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' 
      };
    }
    switch (asset.status) {
      case 'ACTIVE':
        return { label: 'Available / Ready to Use', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'REPAIR':
        return { label: 'Under Repair', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'DAMAGED':
        return { label: 'Reported Issue', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };
      case 'DEPRECATED':
        return { label: 'Retired', color: 'bg-slate-800 text-slate-400 border-slate-700' };
      default:
        return { label: asset.status, color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' };
    }
  };

  const getConditionBadge = (condition: Asset['condition']) => {
    switch (condition) {
      case 'NEW':
        return { label: 'NEW', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
      case 'GOOD':
        return { label: 'GOOD', color: 'bg-sky-500/15 text-sky-400 border-sky-500/30' };
      case 'FAIR':
        return { label: 'FAIR', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
      case 'POOR':
        return { label: 'POOR', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
      default:
        return { label: condition || 'N/A', color: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  const calculateWarranty = (asset: Asset) => {
    if (!asset.warrantyExpiry) return { text: 'Active Manufacturer Warranty', isExpired: false };
    const wDate = new Date(asset.warrantyExpiry);
    const now = new Date();
    const daysLeft = Math.ceil((wDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (daysLeft > 0) {
      return { text: `${daysLeft} days remaining (${asset.warrantyExpiry})`, isExpired: false };
    }
    return { text: `Expired on ${asset.warrantyExpiry}`, isExpired: true };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Camera className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">Asset Tag & Barcode Scanner</h3>
              <p className="text-xs text-slate-400">Instant hardware resolution & inventory verification</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport & Result Details */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {isScanning ? (
            <div className="space-y-4">
              {/* Camera Frame */}
              <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-black aspect-square max-w-[320px] mx-auto shadow-inner">
                <div id="quick-scanner-viewport" className="w-full h-full"></div>
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse shadow-lg shadow-emerald-400/50 pointer-events-none top-1/2"></div>
              </div>

              <p className="text-center text-xs text-slate-400">
                Align QR sticker, 1D barcode, or hardware serial label inside viewfinder.
              </p>

              {/* Manual Tag or Barcode Lookup Input */}
              <div className="pt-2 border-t border-slate-800/80">
                <form onSubmit={handleManualSearch} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder="Or enter tag, S/N, IMEI, or scan with barcode gun..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  >
                    Lookup
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-200">
              {matchedAsset ? (
                /* MATCHED ASSET DETAILS PASSPORT */
                <div className="space-y-4">
                  {/* Verified Notice Bar */}
                  <div className="p-2.5 px-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-300">
                        Asset Verified in Inventory Ledger
                      </span>
                    </div>
                    <button
                      onClick={handleResetScanner}
                      className="text-[11px] font-semibold text-slate-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Rescan
                    </button>
                  </div>

                  {/* Asset Identity Card */}
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-start gap-4">
                    <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0">
                      <img
                        src={matchedAsset.imageUrl || generateSketchGraph(matchedAsset.categoryName || '', matchedAsset.name)}
                        alt={matchedAsset.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <button
                          onClick={() => copyTagToClipboard(matchedAsset.assetCode)}
                          className="font-mono font-bold text-emerald-400 text-xs px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Click to copy Asset Tag"
                        >
                          <Tag className="w-3 h-3" />
                          <span>{matchedAsset.assetCode}</span>
                          {copiedTag ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500" />}
                        </button>

                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${getFriendlyStatus(matchedAsset).color}`}>
                          {getFriendlyStatus(matchedAsset).label}
                        </span>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${getConditionBadge(matchedAsset.condition).color}`}>
                          Condition: {getConditionBadge(matchedAsset.condition).label}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-slate-100 truncate">
                        {matchedAsset.name}
                      </h4>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span>{matchedAsset.categoryName || 'Hardware'}</span>
                        <span className="text-slate-600">•</span>
                        <span className="font-mono">{matchedAsset.model || matchedAsset.name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Custody & Facility Location */}
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        matchedAsset.assignedToUserName ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {matchedAsset.assignedToUserName ? <UserCheck className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-200 truncate">
                          {matchedAsset.assignedToUserName ? `In Custody of: ${matchedAsset.assignedToUserName}` : 'Available in Storage'}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                          <span>{matchedAsset.branchName}</span>
                          {matchedAsset.assignedAt && (
                            <>
                              <span className="text-slate-600">•</span>
                              <span>Issued {matchedAsset.assignedAt}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hardware Identifiers & Serial Attributes Grid */}
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-2">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                      Hardware Specifications & Technical Identifiers
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs font-mono">
                      <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800/80">
                        <span className="text-slate-500 text-[10px] block font-sans">Serial Number</span>
                        <span className="text-slate-200 font-bold truncate block">{matchedAsset.serialNumber || 'N/A'}</span>
                      </div>

                      {matchedAsset.imeiNumber ? (
                        <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block font-sans">IMEI Number</span>
                          <span className="text-slate-200 font-bold truncate block">{matchedAsset.imeiNumber}</span>
                        </div>
                      ) : matchedAsset.macAddress ? (
                        <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block font-sans">MAC Address</span>
                          <span className="text-slate-200 font-bold truncate block">{matchedAsset.macAddress}</span>
                        </div>
                      ) : (
                        <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block font-sans">Device Model</span>
                          <span className="text-slate-200 font-bold truncate block">{matchedAsset.model || matchedAsset.name}</span>
                        </div>
                      )}

                      {matchedAsset.phoneNumber && (
                        <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block font-sans">Phone / SIM Line</span>
                          <span className="text-slate-200 font-bold truncate block">{matchedAsset.phoneNumber}</span>
                        </div>
                      )}

                      {matchedAsset.registeredEmail && (
                        <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800/80">
                          <span className="text-slate-500 text-[10px] block font-sans">Registered Account</span>
                          <span className="text-slate-200 font-bold truncate block">{matchedAsset.registeredEmail}</span>
                        </div>
                      )}
                    </div>

                    {matchedAsset.notes && (
                      <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800/80 text-[11px] text-slate-300 font-sans">
                        <span className="text-slate-500 text-[10px] font-bold uppercase block mb-0.5">Configuration & Profile:</span>
                        {matchedAsset.notes}
                      </div>
                    )}
                  </div>

                  {/* Financial Valuation & Warranty */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[10px] uppercase font-bold">Current Book Value</span>
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <div className="text-base font-black font-mono text-emerald-400 mt-0.5">
                        ${(matchedAsset.currentValue ?? matchedAsset.purchaseCost ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Original Cost: ${(matchedAsset.purchaseCost ?? 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[10px] uppercase font-bold">Warranty Health</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                      {(() => {
                        const warranty = calculateWarranty(matchedAsset);
                        return (
                          <>
                            <div className={`text-xs font-bold mt-1 ${warranty.isExpired ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {warranty.isExpired ? 'Warranty Expired' : 'Active Coverage'}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                              {warranty.text}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Action Suite */}
                  <div className="space-y-2 pt-1">
                    {/* Primary Workflow Button (Check out or Return) */}
                    {!matchedAsset.assignedToUserName ? (
                      <button
                        onClick={() => {
                          if (onSelectAssetForCheckout) onSelectAssetForCheckout(matchedAsset);
                          onClose();
                        }}
                        className="w-full p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl flex items-center justify-between text-left transition-all group cursor-pointer shadow-lg shadow-emerald-600/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                            <ArrowRightLeft className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <div className="text-xs font-bold">Borrow / Check Out Asset</div>
                            <div className="text-[11px] text-emerald-100">Assign this equipment to a team member</div>
                          </div>
                        </div>
                        <span className="text-xs font-bold group-hover:translate-x-1 transition-transform">→</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (onSelectAssetForReturn) onSelectAssetForReturn(matchedAsset);
                          onClose();
                        }}
                        className="w-full p-3 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl flex items-center justify-between text-left transition-all group cursor-pointer shadow-lg shadow-sky-600/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                            <RotateCcw className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <div className="text-xs font-bold">Process Return</div>
                            <div className="text-[11px] text-sky-100">Release staff custody back to storage inventory</div>
                          </div>
                        </div>
                        <span className="text-xs font-bold group-hover:translate-x-1 transition-transform">→</span>
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          if (onSelectAssetForRepair) onSelectAssetForRepair(matchedAsset);
                          onClose();
                        }}
                        className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Wrench className="w-4 h-4 text-amber-400" />
                        <span>Report Issue</span>
                      </button>

                      <button
                        onClick={() => {
                          if (onViewAssetDetails) onViewAssetDetails(matchedAsset);
                          onClose();
                        }}
                        className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4 text-sky-400" />
                        <span>Full Passport</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* UNREGISTERED TAG VIEW */
                <div className="p-6 bg-slate-950/60 border border-amber-500/30 rounded-3xl text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">Asset Not Recognized</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      This tag or serial barcode is not yet registered in the active organization ledger.
                    </p>
                    <p className="text-[11px] font-mono text-emerald-400 mt-2 p-2 bg-slate-900 border border-slate-800 rounded-xl break-all">
                      Scanned Code: {scannedCode}
                    </p>
                  </div>

                  {onEnrollScannedTag && (
                    <button
                      onClick={() => {
                        if (onEnrollScannedTag && scannedCode) {
                          onEnrollScannedTag(scannedCode);
                        }
                        onClose();
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" /> Enroll New Asset with This Tag
                    </button>
                  )}
                </div>
              )}

              {/* Scan Another Button */}
              <button
                onClick={handleResetScanner}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Camera className="w-4 h-4 text-emerald-400" /> Scan Another Tag
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
