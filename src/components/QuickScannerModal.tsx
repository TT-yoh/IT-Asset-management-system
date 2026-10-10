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
  Sparkles
} from 'lucide-react';
import { generateSketchGraph } from './AssetManager';

interface QuickScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  currentUser: User;
  onSelectAssetForCheckout?: (asset: Asset) => void;
  onSelectAssetForReturn?: (asset: Asset) => void;
  onSelectAssetForRepair?: (asset: Asset) => void;
  onEnrollScannedTag?: (tagOrCode: string) => void;
  onUpdateAssetStatus?: (assetId: string, status: AssetStatus) => void;
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
  onUpdateAssetStatus
}) => {
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [matchedAsset, setMatchedAsset] = useState<Asset | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [showTechnicalSpecs, setShowTechnicalSpecs] = useState<boolean>(false);
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
      setShowTechnicalSpecs(false);
      return;
    }

    const timer = setTimeout(() => {
      const html5Qr = new Html5Qrcode('quick-scanner-viewport');
      qrInstanceRef.current = html5Qr;

      html5Qr.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          playBeep();
          setIsScanning(false);
          setScannedCode(decodedText);

          let found: Asset | undefined;
          try {
            const parsed = JSON.parse(decodedText);
            found = assets.find(a => a.assetCode === parsed.code || a.serialNumber === parsed.sn || a.id === parsed.id);
          } catch {
            found = assets.find(a => a.assetCode === decodedText || a.serialNumber === decodedText || a.id === decodedText);
          }

          setMatchedAsset(found || null);
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
    setShowTechnicalSpecs(false);

    if (qrInstanceRef.current) {
      qrInstanceRef.current.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          playBeep();
          setIsScanning(false);
          setScannedCode(decodedText);
          const found = assets.find(a => a.assetCode === decodedText || a.serialNumber === decodedText);
          setMatchedAsset(found || null);
        },
        () => {}
      ).catch(() => {});
    }
  };

  const getFriendlyStatus = (status: Asset['status']) => {
    switch (status) {
      case 'ACTIVE':
        return { label: 'Available / Ready to Use', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'REPAIR':
        return { label: 'Under Repair', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'DAMAGED':
        return { label: 'Reported Issue', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };
      case 'DEPRECATED':
        return { label: 'Retired', color: 'bg-slate-800 text-slate-400 border-slate-700' };
      default:
        return { label: status, color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Camera className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">Scan Equipment Barcode or QR Tag</h3>
              <p className="text-xs text-slate-400">Position tag in the center frame</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport / Results */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {isScanning ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-black aspect-square max-w-[340px] mx-auto shadow-inner">
                <div id="quick-scanner-viewport" className="w-full h-full"></div>
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse shadow-lg shadow-emerald-400/50 pointer-events-none top-1/2"></div>
              </div>
              <p className="text-center text-xs text-slate-400">
                Align any hardware barcode or QR label inside the viewfinder.
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-200">
              {matchedAsset ? (
                /* 1. MATCHED ASSET VIEW */
                <div className="space-y-4">
                  {/* Asset Overview Card */}
                  <div className="p-4 bg-slate-950/80 border border-emerald-500/30 rounded-2xl flex items-start gap-3">
                    <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0">
                      <img
                        src={matchedAsset.imageUrl || generateSketchGraph(matchedAsset.categoryName || '', matchedAsset.name)}
                        alt={matchedAsset.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          {matchedAsset.assetCode}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${getFriendlyStatus(matchedAsset.status).color}`}>
                          {getFriendlyStatus(matchedAsset.status).label}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-slate-100 truncate mt-1">
                        {matchedAsset.name}
                      </h4>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span>{matchedAsset.branchName}</span>
                        {matchedAsset.assignedToUserName && (
                          <>
                            <span className="text-slate-600">•</span>
                            <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                            <span className="text-slate-300 font-medium truncate">{matchedAsset.assignedToUserName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3 Prominent Plain-Language Actions */}
                  <div className="space-y-2.5">
                    <button
                      onClick={() => {
                        if (onSelectAssetForCheckout) onSelectAssetForCheckout(matchedAsset);
                        onClose();
                      }}
                      className="w-full p-3.5 bg-gradient-to-r from-emerald-600/20 to-slate-900 border border-emerald-500/40 hover:border-emerald-500 rounded-2xl flex items-center justify-between text-left transition-all group cursor-pointer shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <ArrowRightLeft className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-100">Borrow / Check Out</div>
                          <div className="text-[11px] text-slate-400">Assign this device to staff custody</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition-transform">→</span>
                    </button>

                    <button
                      onClick={() => {
                        if (onSelectAssetForReturn) onSelectAssetForReturn(matchedAsset);
                        onClose();
                      }}
                      className="w-full p-3.5 bg-gradient-to-r from-sky-600/20 to-slate-900 border border-sky-500/40 hover:border-sky-500 rounded-2xl flex items-center justify-between text-left transition-all group cursor-pointer shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                          <RotateCcw className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-100">Return Item</div>
                          <div className="text-[11px] text-slate-400">Return device to inventory storage</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-sky-400 group-hover:translate-x-1 transition-transform">→</span>
                    </button>

                    <button
                      onClick={() => {
                        if (onSelectAssetForRepair) onSelectAssetForRepair(matchedAsset);
                        onClose();
                      }}
                      className="w-full p-3.5 bg-gradient-to-r from-amber-600/20 to-slate-900 border border-amber-500/40 hover:border-amber-500 rounded-2xl flex items-center justify-between text-left transition-all group cursor-pointer shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                          <Wrench className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-100">Report an Issue / Repair</div>
                          <div className="text-[11px] text-slate-400">Log hardware damage or request technical service</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                  </div>

                  {/* Progressive Disclosure: Collapsible Technical Specs */}
                  <div className="pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowTechnicalSpecs(!showTechnicalSpecs)}
                      className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 flex items-center justify-between font-medium"
                    >
                      <span>Technical & Serial Identifiers</span>
                      {showTechnicalSpecs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showTechnicalSpecs && (
                      <div className="mt-2 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl grid grid-cols-2 gap-2 text-xs font-mono animate-in fade-in duration-150">
                        <div>
                          <span className="text-slate-500 text-[10px] block">Serial Number</span>
                          <span className="text-slate-200">{matchedAsset.serialNumber}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">MAC Address</span>
                          <span className="text-slate-200">{matchedAsset.macAddress || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Category</span>
                          <span className="text-slate-200">{matchedAsset.categoryName || 'Hardware'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Current Value</span>
                          <span className="text-emerald-400 font-bold">${(matchedAsset.currentValue ?? matchedAsset.purchaseCost ?? 0).toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* 2. UNREGISTERED TAG VIEW */
                <div className="p-6 bg-slate-950/60 border border-amber-500/30 rounded-3xl text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">Asset Not Found</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      This tag or barcode is not yet enrolled in the inventory ledger.
                    </p>
                    <p className="text-[11px] font-mono text-emerald-400 mt-1 break-all">
                      Tag: {scannedCode}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      if (onEnrollScannedTag && scannedCode) {
                        onEnrollScannedTag(scannedCode);
                      }
                      onClose();
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> Register New Asset
                  </button>
                </div>
              )}

              {/* Scan Another Button */}
              <button
                onClick={handleResetScanner}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" /> Scan Another Item
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
