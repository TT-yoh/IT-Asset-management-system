import React, { useState, useEffect, useRef } from 'react';
import { Organization, Branch, AssetCategory, Asset, User, AssetStatus } from '../types';
import { AssetFilter } from './AssetFilter';
import { 
  AssetTable, 
  AssetGrid, 
  AssetDetailModal, 
  AssetUpsertModal, 
  AssetCheckOutModal, 
  BatchActionToolbar 
} from './asset-manager';
import { BatchLabelPrinter } from './BatchLabelPrinter';
import { exportToExcel } from '../lib/report-service';
import { AssetService } from '../lib/asset-service';
import {
  Plus,
  Upload,
  Download,
  QrCode,
  LayoutGrid,
  List,
  Camera,
  Search,
  Filter,
  RefreshCw,
  Printer,
  Sparkles,
  Layers,
  X
} from 'lucide-react';
import { QuickScannerModal } from './QuickScannerModal';

export function generateSketchGraph(categoryName: string, name: string): string {
  const normCat = (categoryName || '').toLowerCase();
  
  let paths = '';
  if (normCat.includes('laptop')) {
    paths = `
      <path d="M 40 120 L 160 120 L 180 145 L 20 145 Z" fill="none" stroke="#2dd4bf" stroke-width="2" />
      <path d="M 50 120 L 50 50 L 150 50 L 150 120" fill="none" stroke="#2dd4bf" stroke-width="2" />
      <line x1="90" y1="120" x2="110" y2="120" stroke="#f43f5e" stroke-width="2" />
      <rect x="54" y="54" width="92" height="62" fill="none" stroke="#2dd4bf" stroke-width="1" stroke-dasharray="2,2" />
    `;
  } else if (normCat.includes('phone') || normCat.includes('satcom') || normCat.includes('mobile')) {
    paths = `
      <rect x="75" y="45" width="50" height="110" rx="8" fill="none" stroke="#2dd4bf" stroke-width="2" />
      <rect x="80" y="55" width="40" height="80" rx="3" fill="none" stroke="#2dd4bf" stroke-width="1" stroke-dasharray="2,2" />
      <circle cx="100" cy="145" r="4" fill="none" stroke="#2dd4bf" stroke-width="1" />
    `;
  } else if (normCat.includes('monitor') || normCat.includes('display')) {
    paths = `
      <rect x="40" y="45" width="120" height="80" rx="4" fill="none" stroke="#2dd4bf" stroke-width="2" />
      <rect x="45" y="50" width="110" height="70" fill="none" stroke="#2dd4bf" stroke-width="1" stroke-dasharray="3,3" />
      <path d="M 90 125 L 110 125 L 115 150 L 85 150 Z" fill="none" stroke="#2dd4bf" stroke-width="2" />
      <line x1="70" y1="150" x2="130" y2="150" stroke="#f43f5e" stroke-width="2" />
    `;
  } else {
    paths = `
      <path d="M 100 45 L 150 70 L 100 95 L 50 70 Z" fill="none" stroke="#2dd4bf" stroke-width="2" />
      <path d="M 50 70 L 50 125 L 100 150 L 100 95" fill="none" stroke="#2dd4bf" stroke-width="2" />
      <path d="M 150 70 L 150 125 L 100 150" fill="none" stroke="#2dd4bf" stroke-width="2" />
    `;
  }

  const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">
      <rect width="200" height="200" fill="#090d16" />
      <text x="12" y="20" font-family="monospace" font-size="7" fill="#64748b" font-weight="bold">REF: ASSET-CAD-v2.1</text>
      <text x="12" y="181" font-family="monospace" font-size="7" fill="#2dd4bf" font-weight="bold">SPEC: ${name.slice(0, 20)}</text>
      <text x="12" y="189" font-family="monospace" font-size="6" fill="#64748b">CLASS: ${categoryName.toUpperCase()}</text>
      ${paths}
      <rect x="6" y="6" width="188" height="188" fill="none" stroke="#334155" stroke-width="1" />
    </svg>
  `.trim();

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgContent);
}

export interface AssetManagerProps {
  currentOrg: Organization;
  branches: Branch[];
  categories: AssetCategory[];
  assets: Asset[];
  currentUser: User;
  onAddAsset: (newAsset: Asset) => void;
  onUpdateAsset?: (updatedAsset: Asset) => void;
  onDeleteAsset?: (assetId: string) => void;
  onBulkAddAssets?: (newAssets: Asset[]) => void;
  onBatchUpdateStatus?: (assetIds: string[], status: AssetStatus) => void;
  onBatchTransferBranch?: (assetIds: string[], branchId: string, branchName: string) => void;
  onBatchDelete?: (assetIds: string[]) => void;
  searchQuery: string;
  initialStatusFilter?: string;
  onReportIssue?: (asset: Asset) => void;
}

export const AssetManager: React.FC<AssetManagerProps> = ({
  currentOrg,
  branches,
  categories,
  assets,
  currentUser,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  onBulkAddAssets,
  onBatchUpdateStatus,
  onBatchTransferBranch,
  onBatchDelete,
  searchQuery,
  initialStatusFilter = 'ALL',
  onReportIssue
}) => {
  const [viewMode, setViewMode] = useState<'TABLE' | 'GRID'>('TABLE');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');

  // Modals state
  const [isUpsertOpen, setIsUpsertOpen] = useState<boolean>(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [prefilledTag, setPrefilledTag] = useState<string>('');
  const [selectedAssetForDetails, setSelectedAssetForDetails] = useState<Asset | null>(null);
  const [checkoutModalAsset, setCheckoutModalAsset] = useState<Asset | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isLabelPrinterOpen, setIsLabelPrinterOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importBanner, setImportBanner] = useState<{ message: string; isError: boolean } | null>(null);

  // Multi-selection state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  // Filter pipeline
  const filteredAssets = assets.filter((asset) => {
    if (statusFilter !== 'ALL' && asset.status !== statusFilter) return false;
    if (categoryFilter !== 'ALL' && asset.categoryId !== categoryFilter) return false;
    if (branchFilter !== 'ALL' && asset.branchId !== branchFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        asset.name.toLowerCase().includes(q) ||
        asset.assetCode.toLowerCase().includes(q) ||
        asset.serialNumber.toLowerCase().includes(q) ||
        (asset.model && asset.model.toLowerCase().includes(q)) ||
        (asset.assignedToUserName && asset.assignedToUserName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Multi-select handlers
  const handleToggleSelect = (id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (filteredAssets.every((a) => selectedAssetIds.has(a.id))) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(filteredAssets.map((a) => a.id)));
    }
  };

  // Batch action executions
  const handleBatchStatusChange = (status: AssetStatus) => {
    const ids = Array.from(selectedAssetIds);
    if (onBatchUpdateStatus) {
      onBatchUpdateStatus(ids, status);
    } else if (onUpdateAsset) {
      assets.filter((a) => selectedAssetIds.has(a.id)).forEach((a) => onUpdateAsset({ ...a, status }));
    }
    setSelectedAssetIds(new Set());
  };

  const handleBatchTransfer = (branchId: string, branchName: string) => {
    const ids = Array.from(selectedAssetIds);
    if (onBatchTransferBranch) {
      onBatchTransferBranch(ids, branchId, branchName);
    } else if (onUpdateAsset) {
      assets.filter((a) => selectedAssetIds.has(a.id)).forEach((a) => onUpdateAsset({ ...a, branchId, branchName }));
    }
    setSelectedAssetIds(new Set());
  };

  const handleBatchDeleteAction = () => {
    const ids = Array.from(selectedAssetIds);
    if (window.confirm(`Are you sure you want to permanently delete ${ids.length} assets?`)) {
      if (onBatchDelete) {
        onBatchDelete(ids);
      } else if (onDeleteAsset) {
        ids.forEach((id) => onDeleteAsset(id));
      }
      setSelectedAssetIds(new Set());
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    exportToExcel(filteredAssets, `${currentOrg.name.replace(/\s+/g, '_')}_Fleet_Assets.xlsx`);
  };

  // Import Legacy / Preexisting Assets via CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const defaultBranch = branches[0]?.name || 'Main HQ';
      const result = AssetService.processBulkCSV(text, currentOrg.id, defaultBranch);

      if (result.errors.length > 0 && result.createdAssets.length === 0) {
        setImportBanner({ message: `CSV Import Failed: ${result.errors[0]?.message}`, isError: true });
      } else {
        if (result.createdAssets.length > 0) {
          if (onBulkAddAssets) {
            onBulkAddAssets(result.createdAssets);
          } else if (onAddAsset) {
            result.createdAssets.forEach((a) => onAddAsset(a));
          }
          const msg = result.errors.length > 0
            ? `Imported ${result.successCount} assets with ${result.errorCount} warning(s).`
            : `Successfully onboarded ${result.successCount} historical/legacy assets into TiDB!`;
          setImportBanner({ message: msg, isError: false });
        }
      }
      setTimeout(() => setImportBanner(null), 6000);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Import Notification Banner */}
      {importBanner && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold animate-in fade-in slide-in-from-top-2 ${
            importBanner.isError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          <span>{importBanner.message}</span>
          <button
            onClick={() => setImportBanner(null)}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Control Header */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Hardware Fleet Inventory</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              {filteredAssets.length} Assets
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Enterprise hardware lifecycle tracking, depreciation modeling, and barcode audits
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('TABLE')}
              className={`p-2 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'TABLE'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('GRID')}
              className={`p-2 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'GRID'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Scanner Button */}
          <button
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors border border-slate-700"
          >
            <Camera className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Scan QR</span>
          </button>

          {/* Batch Print Labels */}
          <button
            onClick={() => setIsLabelPrinterOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors border border-slate-700"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Print Labels</span>
          </button>

          {/* Import CSV */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors border border-slate-700 cursor-pointer"
            title="Import preexisting or historical assets via CSV spreadsheet"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Import CSV</span>
          </button>

          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors border border-slate-700"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>

          {/* Enroll Asset Button */}
          <button
            onClick={() => {
              setEditingAsset(null);
              setIsUpsertOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Enroll Asset</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="REPAIR">REPAIR</option>
            <option value="DAMAGED">DAMAGED</option>
            <option value="DEPRECATED">DEPRECATED</option>
            <option value="SOLD">SOLD</option>
            <option value="DISPOSED">DISPOSED</option>
          </select>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Branch Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Branch:</span>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Facilities</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Filters */}
        {(statusFilter !== 'ALL' || categoryFilter !== 'ALL' || branchFilter !== 'ALL') && (
          <button
            onClick={() => {
              setStatusFilter('ALL');
              setCategoryFilter('ALL');
              setBranchFilter('ALL');
            }}
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Main Viewport */}
      {viewMode === 'TABLE' ? (
        <AssetTable
          assets={filteredAssets}
          selectedIds={selectedAssetIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onViewDetails={(ast) => setSelectedAssetForDetails(ast)}
          onEditAsset={(ast) => {
            setEditingAsset(ast);
            setIsUpsertOpen(true);
          }}
          onDeleteAsset={(id) => {
            if (onDeleteAsset && window.confirm('Delete this asset from ledger?')) {
              onDeleteAsset(id);
            }
          }}
          onShowQR={(ast) => setSelectedAssetForDetails(ast)}
        />
      ) : (
        <AssetGrid
          assets={filteredAssets}
          selectedIds={selectedAssetIds}
          onToggleSelect={handleToggleSelect}
          onViewDetails={(ast) => setSelectedAssetForDetails(ast)}
          onEditAsset={(ast) => {
            setEditingAsset(ast);
            setIsUpsertOpen(true);
          }}
          onDeleteAsset={(id) => {
            if (onDeleteAsset && window.confirm('Delete this asset from ledger?')) {
              onDeleteAsset(id);
            }
          }}
          onShowQR={(ast) => setSelectedAssetForDetails(ast)}
        />
      )}

      {/* Sticky Batch Actions Toolbar */}
      <BatchActionToolbar
        selectedCount={selectedAssetIds.size}
        branches={branches}
        onBatchStatusChange={handleBatchStatusChange}
        onBatchTransferBranch={handleBatchTransfer}
        onBatchDelete={handleBatchDeleteAction}
        onBatchPrintLabels={() => setIsLabelPrinterOpen(true)}
        onClearSelection={() => setSelectedAssetIds(new Set())}
      />

      {/* Asset Details Modal */}
      {selectedAssetForDetails && (
        <AssetDetailModal
          asset={selectedAssetForDetails}
          onClose={() => setSelectedAssetForDetails(null)}
          onEdit={(ast) => {
            setSelectedAssetForDetails(null);
            setEditingAsset(ast);
            setIsUpsertOpen(true);
          }}
          onReportRepair={onReportIssue}
          onPrintLabel={(ast) => {
            setSelectedAssetIds(new Set([ast.id]));
            setIsLabelPrinterOpen(true);
          }}
        />
      )}

      {/* Asset Upsert (Add/Edit) Modal with Gemini AI */}
      <AssetUpsertModal
        isOpen={isUpsertOpen}
        editingAsset={editingAsset}
        prefilledTag={prefilledTag}
        branches={branches}
        categories={categories}
        currentOrg={currentOrg}
        onClose={() => {
          setIsUpsertOpen(false);
          setEditingAsset(null);
          setPrefilledTag('');
        }}
        onSave={(ast) => {
          if (editingAsset && onUpdateAsset) {
            onUpdateAsset(ast);
          } else {
            onAddAsset(ast);
          }
        }}
      />

      {/* Live Dual-Audience Camera QR Scanner Modal */}
      <QuickScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        assets={assets}
        currentUser={currentUser}
        onSelectAssetForCheckout={(ast) => {
          setSelectedAssetForDetails(ast);
        }}
        onSelectAssetForReturn={(ast) => {
          setSelectedAssetForDetails(ast);
        }}
        onSelectAssetForRepair={(ast) => {
          if (onReportIssue) onReportIssue(ast);
        }}
        onEnrollScannedTag={(tag) => {
          setEditingAsset(null);
          setPrefilledTag(tag);
          setIsUpsertOpen(true);
        }}
        onUpdateAssetStatus={(assetId, st) => {
          if (onBatchUpdateStatus) onBatchUpdateStatus([assetId], st);
        }}
      />

      {/* Batch Label Printer Modal */}
      {isLabelPrinterOpen && (
        <BatchLabelPrinter
          assets={
            selectedAssetIds.size > 0
              ? assets.filter((a) => selectedAssetIds.has(a.id))
              : filteredAssets
          }
          organization={currentOrg}
          onClose={() => setIsLabelPrinterOpen(false)}
        />
      )}
    </div>
  );
};
