import React, { useState, useEffect, useRef } from 'react';
import { Asset, Branch, Organization } from '../../types';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Camera, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Building2, 
  Search, 
  Layers, 
  ArrowRightLeft, 
  Download, 
  RefreshCw, 
  ShieldCheck,
  Volume2,
  VolumeX,
  FileSpreadsheet,
  Check,
  Plus
} from 'lucide-react';
import { exportToExcel } from '../../lib/report-service';

interface PhysicalAuditModalProps {
  organization: Organization;
  branches: Branch[];
  allAssets: Asset[];
  onBatchTransferBranch?: (assetIds: string[], branchId: string, branchName: string) => void;
  onBatchUpdateStatus?: (assetIds: string[], status: any) => void;
  onClose: () => void;
  onRegisterUnfoundAsset?: (tag: string) => void;
}

export const PhysicalAuditModal: React.FC<PhysicalAuditModalProps> = ({
  organization,
  branches,
  allAssets,
  onBatchTransferBranch,
  onBatchUpdateStatus,
  onClose,
  onRegisterUnfoundAsset
}) => {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || '');
  const activeBranch = branches.find(b => b.id === selectedBranchId) || branches[0] || { id: 'b1', name: 'Main HQ' };

  // Assets expected at this branch
  const expectedAssets = allAssets.filter(a => a.branchId === activeBranch.id || a.branchName === activeBranch.name);

  // Audit state
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [manualInput, setManualInput] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const [audioFeedback, setAudioFeedback] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'VERIFIED' | 'DISPLACED' | 'MISSING' | 'UNREGISTERED'>('VERIFIED');
  const [recentScanBanner, setRecentScanBanner] = useState<{
    type: 'VERIFIED' | 'DISPLACED' | 'UNREGISTERED';
    message: string;
    asset?: Asset;
  } | null>(null);

  const qrInstanceRef = useRef<Html5Qrcode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play auditory feedback
  const playSound = (type: 'SUCCESS' | 'WARN' | 'ERROR') => {
    if (!audioFeedback) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'SUCCESS') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'WARN') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {}
  };

  // Helper to match scanned barcode across Asset Code, S/N, IMEI, MAC, or Phone line
  const findMatchingAsset = (code: string): Asset | undefined => {
    const clean = code.trim().toLowerCase();
    const stripped = clean.replace(/[^a-z0-9]/g, '');

    return allAssets.find(a => {
      if (a.assetCode.toLowerCase() === clean) return true;
      if (a.serialNumber && a.serialNumber.toLowerCase() === clean) return true;
      if (a.imeiNumber && a.imeiNumber.replace(/[^a-z0-9]/g, '').toLowerCase() === stripped) return true;
      if (a.macAddress && a.macAddress.replace(/[^a-z0-9]/g, '').toLowerCase() === stripped) return true;
      if (a.phoneNumber && a.phoneNumber.replace(/[^0-9]/g, '') === stripped) return true;
      return false;
    });
  };

  const isAssetScanned = (a: Asset): boolean => {
    if (scannedCodes.has(a.assetCode)) return true;
    if (a.serialNumber && scannedCodes.has(a.serialNumber)) return true;
    if (a.imeiNumber && scannedCodes.has(a.imeiNumber)) return true;
    if (a.macAddress && scannedCodes.has(a.macAddress)) return true;
    if (a.phoneNumber && scannedCodes.has(a.phoneNumber)) return true;

    for (const code of scannedCodes) {
      const stripped = code.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (a.imeiNumber && a.imeiNumber.replace(/[^a-z0-9]/g, '').toLowerCase() === stripped) return true;
      if (a.macAddress && a.macAddress.replace(/[^a-z0-9]/g, '').toLowerCase() === stripped) return true;
    }
    return false;
  };

  // Process a scanned code (assetCode or serialNumber or JSON payload)
  const processCode = (rawCode: string) => {
    const clean = rawCode.trim();
    if (!clean) return;

    let targetCode = clean;
    try {
      const parsed = JSON.parse(clean);
      if (parsed.code) targetCode = parsed.code;
    } catch {}

    // Check match in all assets across all identifiers (Tag, S/N, IMEI, MAC)
    const matchedAsset = findMatchingAsset(targetCode);

    setScannedCodes(prev => new Set(prev).add(targetCode));

    if (!matchedAsset) {
      playSound('ERROR');
      setRecentScanBanner({
        type: 'UNREGISTERED',
        message: `Unregistered Tag: "${targetCode}" is not found in database!`
      });
      setActiveTab('UNREGISTERED');
      return;
    }

    const isAtThisBranch = matchedAsset.branchId === activeBranch.id || matchedAsset.branchName === activeBranch.name;
    if (isAtThisBranch) {
      playSound('SUCCESS');
      setRecentScanBanner({
        type: 'VERIFIED',
        message: `Verified: ${matchedAsset.name} (${matchedAsset.assetCode}) confirmed at ${activeBranch.name}`,
        asset: matchedAsset
      });
    } else {
      playSound('WARN');
      setRecentScanBanner({
        type: 'DISPLACED',
        message: `Displaced: ${matchedAsset.name} is assigned to ${matchedAsset.branchName || 'Another Branch'}!`,
        asset: matchedAsset
      });
      setActiveTab('DISPLACED');
    }
  };

  // Start HTML5 Camera Scanner
  useEffect(() => {
    if (!isCameraActive) return;

    let isSubscribed = true;
    const scannerId = 'audit-camera-viewport';

    const startScanner = async () => {
      try {
        const html5Qr = new Html5Qrcode(scannerId);
        qrInstanceRef.current = html5Qr;

        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (isSubscribed) {
              processCode(decodedText);
            }
          },
          () => {}
        );
      } catch (err) {
        console.warn('Camera audit scanner error:', err);
      }
    };

    const timeout = setTimeout(startScanner, 200);

    return () => {
      isSubscribed = false;
      clearTimeout(timeout);
      if (qrInstanceRef.current) {
        qrInstanceRef.current.stop().then(() => {
          qrInstanceRef.current?.clear();
          qrInstanceRef.current = null;
        }).catch(() => {});
      }
    };
  }, [isCameraActive, activeBranch.id]);

  // Classification lists supporting all identifier formats
  const verifiedAssets = expectedAssets.filter(isAssetScanned);
  const missingAssets = expectedAssets.filter(a => !isAssetScanned(a));
  const displacedAssets = allAssets.filter(a => {
    const isAtOtherBranch = a.branchId !== activeBranch.id && a.branchName !== activeBranch.name;
    return isAtOtherBranch && isAssetScanned(a);
  });

  const unregisteredCodes = Array.from(scannedCodes).filter((code: string) => !findMatchingAsset(code));

  const totalExpected = expectedAssets.length;
  const verifiedCount = verifiedAssets.length;
  const completionPercent = totalExpected > 0 ? Math.round((verifiedCount / totalExpected) * 100) : 100;

  // Handle single displaced transfer
  const handleTransferDisplaced = (asset: Asset) => {
    if (onBatchTransferBranch) {
      onBatchTransferBranch([asset.id], activeBranch.id, activeBranch.name);
      setRecentScanBanner({
        type: 'VERIFIED',
        message: `Successfully transferred ${asset.name} to ${activeBranch.name}!`,
        asset
      });
    }
  };

  // Handle batch transfer all displaced
  const handleTransferAllDisplaced = () => {
    if (onBatchTransferBranch && displacedAssets.length > 0) {
      onBatchTransferBranch(displacedAssets.map(a => a.id), activeBranch.id, activeBranch.name);
      setRecentScanBanner({
        type: 'VERIFIED',
        message: `Transferred all ${displacedAssets.length} displaced assets to ${activeBranch.name}!`
      });
    }
  };

  // Export discrepancy report
  const handleExportDiscrepancyReport = () => {
    const reportData = [
      ...verifiedAssets.map(a => ({
        'Asset Code': a.assetCode,
        'Name': a.name,
        'Serial Number': a.serialNumber || 'N/A',
        'Registered Location': a.branchName || 'Unassigned',
        'Audited Location': activeBranch.name,
        'Audit Status': 'VERIFIED PRESENT',
        'Audited Date': new Date().toISOString().split('T')[0]
      })),
      ...displacedAssets.map(a => ({
        'Asset Code': a.assetCode,
        'Name': a.name,
        'Serial Number': a.serialNumber || 'N/A',
        'Registered Location': a.branchName || 'Unassigned',
        'Audited Location': activeBranch.name,
        'Audit Status': 'LOCATION DISCREPANCY (DISPLACED)',
        'Audited Date': new Date().toISOString().split('T')[0]
      })),
      ...missingAssets.map(a => ({
        'Asset Code': a.assetCode,
        'Name': a.name,
        'Serial Number': a.serialNumber || 'N/A',
        'Registered Location': a.branchName || 'Unassigned',
        'Audited Location': activeBranch.name,
        'Audit Status': 'UNACCOUNTED / MISSING',
        'Audited Date': new Date().toISOString().split('T')[0]
      }))
    ];

    exportToExcel(reportData, `${organization.name}_Audit_Reconciliation_${activeBranch.name.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex flex-col items-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-6 my-4 sm:my-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  Physical Inventory Audit Walk
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live Reconciliation
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Rapid floor audit, location discrepancy detection, and single-click asset transfer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => setAudioFeedback(!audioFeedback)}
              className={`p-2.5 rounded-xl border transition-colors ${
                audioFeedback 
                  ? 'bg-slate-800 border-slate-700 text-emerald-400' 
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
              title={audioFeedback ? 'Sound effects enabled' : 'Sound effects muted'}
            >
              {audioFeedback ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={handleExportDiscrepancyReport}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export Audit</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Branch Selector & Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-emerald-400" /> Audited Facility
            </span>
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                setScannedCodes(new Set());
                setRecentScanBanner(null);
              }}
              className="mt-2 w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium">Reconciliation</span>
              <div className="text-xl font-black text-slate-100 mt-1">
                {verifiedCount} / {totalExpected}
              </div>
              <span className="text-[10px] text-emerald-400 font-bold">{completionPercent}% Verified</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-black text-emerald-400 text-sm">
              {completionPercent}%
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium">Location Mismatch</span>
              <div className="text-xl font-black text-amber-400 mt-1">
                {displacedAssets.length}
              </div>
              <span className="text-[10px] text-slate-500">From other sites</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-black text-amber-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium">Pending Scans</span>
              <div className="text-xl font-black text-rose-400 mt-1">
                {missingAssets.length}
              </div>
              <span className="text-[10px] text-slate-500">Unaccounted</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center font-black text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Input Bar & Camera Scanner Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Scanner Viewport (1 Col) */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center relative min-h-[240px]">
            {isCameraActive ? (
              <div className="w-full flex flex-col items-center">
                <div 
                  id="audit-camera-viewport" 
                  className="w-full max-w-[240px] aspect-square rounded-xl overflow-hidden border-2 border-emerald-500/50"
                />
                <button
                  onClick={() => setIsCameraActive(false)}
                  className="mt-3 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Turn off camera
                </button>
              </div>
            ) : (
              <div className="text-center py-6">
                <Camera className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400 mb-3">Camera is paused</p>
                <button
                  onClick={() => setIsCameraActive(true)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Activate Camera
                </button>
              </div>
            )}
          </div>

          {/* Quick Input Bar & Recent Banner (2 Cols) */}
          <div className="md:col-span-2 flex flex-col justify-between gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Hardware Scanner / Manual Barcode Input
              </label>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualInput.trim()) {
                    processCode(manualInput);
                    setManualInput('');
                  }
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Scan barcode or type Asset Code / Serial No. (Press Enter)..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-emerald-600/20"
                >
                  Scan
                </button>
              </form>
            </div>

            {/* Live Scan Notification Feedback Banner */}
            {recentScanBanner ? (
              <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-150 ${
                recentScanBanner.type === 'VERIFIED'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : recentScanBanner.type === 'DISPLACED'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  {recentScanBanner.type === 'VERIFIED' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : recentScanBanner.type === 'DISPLACED' ? (
                    <ArrowRightLeft className="w-5 h-5 text-amber-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <span className="font-semibold truncate">{recentScanBanner.message}</span>
                </div>

                {recentScanBanner.type === 'DISPLACED' && recentScanBanner.asset && (
                  <button
                    onClick={() => handleTransferDisplaced(recentScanBanner.asset!)}
                    className="shrink-0 px-3 py-1 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-amber-400 transition-colors cursor-pointer"
                  >
                    Transfer to {activeBranch.name}
                  </button>
                )}

                {recentScanBanner.type === 'UNREGISTERED' && onRegisterUnfoundAsset && (
                  <button
                    onClick={() => onRegisterUnfoundAsset(Array.from(scannedCodes).pop() || '')}
                    className="shrink-0 px-3 py-1 bg-rose-500 text-white font-bold rounded-lg text-xs hover:bg-rose-400 transition-colors cursor-pointer"
                  >
                    Register Asset
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-500 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Ready to scan. Aim camera or use hardware handheld barcode gun.</span>
              </div>
            )}
          </div>
        </div>

        {/* Categorized Discrepancy Tabs */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 overflow-x-auto text-xs font-semibold">
              <button
                onClick={() => setActiveTab('VERIFIED')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'VERIFIED' 
                    ? 'bg-emerald-500 text-slate-950 font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Verified Present ({verifiedCount})
              </button>
              <button
                onClick={() => setActiveTab('DISPLACED')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'DISPLACED' 
                    ? 'bg-amber-500 text-slate-950 font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Displaced ({displacedAssets.length})
              </button>
              <button
                onClick={() => setActiveTab('MISSING')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'MISSING' 
                    ? 'bg-rose-500 text-white font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pending / Missing ({missingAssets.length})
              </button>
              <button
                onClick={() => setActiveTab('UNREGISTERED')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'UNREGISTERED' 
                    ? 'bg-purple-600 text-white font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Unregistered ({unregisteredCodes.length})
              </button>
            </div>

            {activeTab === 'DISPLACED' && displacedAssets.length > 0 && (
              <button
                onClick={handleTransferAllDisplaced}
                className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer All to {activeBranch.name}
              </button>
            )}
          </div>

          {/* Tab Content List */}
          <div className="max-h-60 overflow-y-auto mt-3 divide-y divide-slate-800/60 text-xs">
            {activeTab === 'VERIFIED' && (
              verifiedAssets.length === 0 ? (
                <div className="py-8 text-center text-slate-500">No assets verified yet. Start scanning tags to confirm.</div>
              ) : (
                verifiedAssets.map(ast => (
                  <div key={ast.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-100">{ast.name}</div>
                      <div className="text-[11px] font-mono text-emerald-400">
                        {ast.assetCode}
                        {ast.imeiNumber ? (
                          <span className="text-slate-300"> • IMEI: {ast.imeiNumber}</span>
                        ) : ast.macAddress ? (
                          <span className="text-slate-300"> • MAC: {ast.macAddress}</span>
                        ) : ast.serialNumber && !ast.serialNumber.toLowerCase().startsWith('sn-ast') ? (
                          <span className="text-slate-300"> • S/N: {ast.serialNumber}</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Confirmed
                    </span>
                  </div>
                ))
              )
            )}

            {activeTab === 'DISPLACED' && (
              displacedAssets.length === 0 ? (
                <div className="py-8 text-center text-slate-500">No displaced assets detected from other branches.</div>
              ) : (
                displacedAssets.map(ast => (
                  <div key={ast.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-100">{ast.name}</div>
                      <div className="text-[11px] font-mono text-amber-400">
                        {ast.assetCode} • Assigned to: <span className="underline">{ast.branchName}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTransferDisplaced(ast)}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Transfer Here
                    </button>
                  </div>
                ))
              )
            )}

            {activeTab === 'MISSING' && (
              missingAssets.length === 0 ? (
                <div className="py-8 text-center text-emerald-400 font-semibold">100% of expected assets accounted for!</div>
              ) : (
                missingAssets.map(ast => (
                  <div key={ast.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-300">{ast.name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{ast.assetCode} • S/N: {ast.serialNumber || 'N/A'}</div>
                    </div>
                    <span className="text-[11px] text-rose-400 font-medium">Not Scanned</span>
                  </div>
                ))
              )
            )}

            {activeTab === 'UNREGISTERED' && (
              unregisteredCodes.length === 0 ? (
                <div className="py-8 text-center text-slate-500">No unregistered tags found.</div>
              ) : (
                unregisteredCodes.map(code => (
                  <div key={code} className="py-2.5 flex items-center justify-between">
                    <span className="font-mono font-bold text-purple-400">{code}</span>
                    {onRegisterUnfoundAsset && (
                      <button
                        onClick={() => onRegisterUnfoundAsset(code)}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Register
                      </button>
                    )}
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <span className="text-xs text-slate-400">
            {verifiedCount} of {totalExpected} assets reconciled ({completionPercent}%)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportDiscrepancyReport}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Download Report
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              Finish Audit
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

