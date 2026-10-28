import React, { useState, useRef } from 'react';
import { Asset, Branch, AssetCategory, Organization, AssetStatus } from '../../types';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  X, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  Sparkles, 
  ArrowRight, 
  Check, 
  AlertCircle,
  HelpCircle,
  Layers,
  Database
} from 'lucide-react';

interface ImportAssetsModalProps {
  organization: Organization;
  branches: Branch[];
  categories: AssetCategory[];
  existingAssets: Asset[];
  onBulkAddAssets: (assets: Asset[]) => void;
  onClose: () => void;
}

type DuplicateStrategy = 'SKIP' | 'OVERWRITE' | 'RENAME_TAG';

interface ColumnMapping {
  name: string;
  assetCode: string;
  serialNumber: string;
  category: string;
  purchaseCost: string;
  purchaseDate: string;
  branchName: string;
  departmentName: string;
  assignedTo: string;
  status: string;
  condition: string;
}

interface ParsedRow {
  index: number;
  raw: Record<string, any>;
  mapped: {
    name: string;
    assetCode: string;
    serialNumber: string;
    category: string;
    purchaseCost: number;
    purchaseDate: string;
    branchName: string;
    departmentName: string;
    assignedTo: string;
    status: AssetStatus;
    condition: 'NEW' | 'GOOD' | 'FAIR' | 'POOR';
  };
  isValid: boolean;
  errors: string[];
  isDuplicateSerial: boolean;
  isDuplicateTag: boolean;
}

export const ImportAssetsModal: React.FC<ImportAssetsModalProps> = ({
  organization,
  branches,
  categories,
  existingAssets,
  onBulkAddAssets,
  onClose
}) => {
  const [step, setStep] = useState<'UPLOAD' | 'MAP' | 'PREVIEW'>('UPLOAD');
  const [fileName, setFileName] = useState<string>('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);

  // Mapping state
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: '',
    assetCode: '',
    serialNumber: '',
    category: '',
    purchaseCost: '',
    purchaseDate: '',
    branchName: '',
    departmentName: '',
    assignedTo: '',
    status: '',
    condition: ''
  });

  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('SKIP');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect matching headers using fuzzy keyword matching
  const autoDetectMapping = (headers: string[]): ColumnMapping => {
    const findBestHeader = (keywords: string[]): string => {
      const match = headers.find(h => {
        const norm = h.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        return keywords.some(kw => norm.includes(kw));
      });
      return match || '';
    };

    return {
      name: findBestHeader(['model', 'devicename', 'assetname', 'name', 'item', 'description']),
      assetCode: findBestHeader(['assettag', 'assetcode', 'tag', 'barcode', 'assetid']),
      serialNumber: findBestHeader(['serialnumber', 'serialno', 'serial', 'sn']),
      category: findBestHeader(['category', 'type', 'classtype', 'assetcategory']),
      purchaseCost: findBestHeader(['purchasecost', 'cost', 'price', 'purchaseprice', 'amount', 'value']),
      purchaseDate: findBestHeader(['purchasedate', 'acquired', 'acquisitiondate', 'date']),
      branchName: findBestHeader(['branch', 'site', 'location', 'facility']),
      departmentName: findBestHeader(['department', 'dept', 'division']),
      assignedTo: findBestHeader(['assignedto', 'custodian', 'employee', 'user', 'owner']),
      status: findBestHeader(['status', 'state', 'lifecycle']),
      condition: findBestHeader(['condition', 'health', 'grade'])
    };
  };

  // Process uploaded Excel / CSV File
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheets = workbook.SheetNames;
      setSheetNames(sheets);

      const firstSheet = sheets[0] || '';
      setSelectedSheet(firstSheet);

      const worksheet = workbook.Sheets[firstSheet];
      if (worksheet) {
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        if (jsonData.length > 0) {
          const headers = Object.keys(jsonData[0] || {});
          setRawHeaders(headers);
          setRawRows(jsonData);
          setMapping(autoDetectMapping(headers));
          setStep('MAP');
        }
      }
    } catch (err) {
      console.error('Failed to parse spreadsheet file:', err);
      alert('Could not parse spreadsheet file. Please verify it is a valid .xlsx or .csv.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Download official sample Excel template
  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        'Asset Name': 'MacBook Pro 16" M3 Max',
        'Asset Tag': 'OMNI-LPT-901',
        'Serial Number': 'C02G8901M3X',
        'Category': 'Laptops',
        'Purchase Cost': 3499.00,
        'Purchase Date': '2024-01-15',
        'Location': branches[0]?.name || 'Main HQ',
        'Department': 'Engineering',
        'Assigned To': 'sarah.engineer@omnicorp.com',
        'Status': 'ACTIVE',
        'Condition': 'NEW'
      },
      {
        'Asset Name': 'Dell UltraSharp 27" 4K',
        'Asset Tag': 'OMNI-MON-442',
        'Serial Number': 'CN-0Y3K2M-12',
        'Category': 'Monitors',
        'Purchase Cost': 580.00,
        'Purchase Date': '2023-11-20',
        'Location': branches[0]?.name || 'Main HQ',
        'Department': 'Design',
        'Assigned To': '',
        'Status': 'SPARE',
        'Condition': 'GOOD'
      },
      {
        'Asset Name': 'Cisco Catalyst 9300 Switch',
        'Asset Tag': 'OMNI-NET-801',
        'Serial Number': 'FOC2439L901',
        'Category': 'Networking',
        'Purchase Cost': 3200.00,
        'Purchase Date': '2023-08-05',
        'Location': branches[0]?.name || 'Main HQ',
        'Department': 'IT Operations',
        'Assigned To': '',
        'Status': 'ACTIVE',
        'Condition': 'GOOD'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asset_Inventory');
    XLSX.writeFile(wb, 'OmniAsset_Import_Template.xlsx');
  };

  // Validate and parse mapped rows
  const parsedRows: ParsedRow[] = rawRows.map((row, idx) => {
    const errors: string[] = [];
    const name = String(row[mapping.name] || '').trim();
    if (!name) errors.push('Device Name is required');

    let category = String(row[mapping.category] || '').trim();
    if (!category) {
      category = categories[0]?.name || 'Hardware';
    }

    let assetCode = String(row[mapping.assetCode] || '').trim();
    if (!assetCode) {
      const catPrefix = category.slice(0, 3).toUpperCase();
      assetCode = `OMNI-${catPrefix}-${String(100 + idx).padStart(3, '0')}`;
    }

    const serialNumber = String(row[mapping.serialNumber] || '').trim();

    // Check duplicates against existing assets
    const isDuplicateSerial = Boolean(
      serialNumber && existingAssets.some(a => a.serialNumber && a.serialNumber.toLowerCase() === serialNumber.toLowerCase())
    );

    const isDuplicateTag = existingAssets.some(
      a => a.assetCode.toLowerCase() === assetCode.toLowerCase()
    );

    // Number conversion for cost
    let purchaseCost = 0;
    const rawCost = String(row[mapping.purchaseCost] || '').replace(/[^0-9.-]+/g, '');
    if (rawCost) {
      const num = parseFloat(rawCost);
      if (!isNaN(num)) purchaseCost = num;
    }

    let purchaseDate = String(row[mapping.purchaseDate] || '').trim();
    if (!purchaseDate) {
      purchaseDate = new Date().toISOString().split('T')[0]!;
    }

    const branchName = String(row[mapping.branchName] || branches[0]?.name || 'Main HQ').trim();
    const departmentName = String(row[mapping.departmentName] || 'General IT').trim();
    const assignedTo = String(row[mapping.assignedTo] || '').trim();

    const rawStatus = String(row[mapping.status] || 'ACTIVE').trim().toUpperCase();
    const status: AssetStatus = ['ACTIVE', 'SPARE', 'REPAIR', 'DAMAGED', 'RETIRED'].includes(rawStatus)
      ? (rawStatus as AssetStatus)
      : 'ACTIVE';

    const rawCondition = String(row[mapping.condition] || 'GOOD').trim().toUpperCase();
    const condition = ['NEW', 'GOOD', 'FAIR', 'POOR'].includes(rawCondition)
      ? (rawCondition as 'NEW' | 'GOOD' | 'FAIR' | 'POOR')
      : 'GOOD';

    return {
      index: idx + 1,
      raw: row,
      mapped: {
        name,
        assetCode,
        serialNumber,
        category,
        purchaseCost,
        purchaseDate,
        branchName,
        departmentName,
        assignedTo,
        status,
        condition
      },
      isValid: errors.length === 0,
      errors,
      isDuplicateSerial,
      isDuplicateTag
    };
  });

  // Count summaries
  const validCount = parsedRows.filter(r => r.isValid && !r.isDuplicateSerial && !r.isDuplicateTag).length;
  const duplicateCount = parsedRows.filter(r => r.isDuplicateSerial || r.isDuplicateTag).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  // Final batch commit
  const handleCommitImport = () => {
    const finalAssetsToImport: Asset[] = [];
    let skipped = 0;

    parsedRows.forEach((row, i) => {
      if (!row.isValid) {
        skipped++;
        return;
      }

      const hasDuplicateConflict = row.isDuplicateSerial || row.isDuplicateTag;
      if (hasDuplicateConflict) {
        if (duplicateStrategy === 'SKIP') {
          skipped++;
          return;
        }
      }

      let finalCode = row.mapped.assetCode;
      if (hasDuplicateConflict && duplicateStrategy === 'RENAME_TAG') {
        finalCode = `${finalCode}-${Date.now().toString().slice(-4)}`;
      }

      const matchedCat = categories.find(c => c.name.toLowerCase() === row.mapped.category.toLowerCase()) || categories[0] || { id: 'cat-laptops', name: 'Laptops' };
      const matchedBranch = branches.find(b => b.name.toLowerCase() === row.mapped.branchName.toLowerCase()) || branches[0] || { id: 'b1', name: 'Main HQ' };

      const newAsset: Asset = {
        id: `ast-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
        orgId: organization.id,
        name: row.mapped.name,
        model: row.mapped.name,
        categoryId: matchedCat.id,
        categoryName: matchedCat.name,
        category: matchedCat.name,
        assetCode: finalCode,
        serialNumber: row.mapped.serialNumber || `SN-${finalCode}`,
        status: row.mapped.status,
        condition: row.mapped.condition,
        purchaseCost: row.mapped.purchaseCost,
        purchasePrice: row.mapped.purchaseCost,
        currentValue: row.mapped.purchaseCost,
        purchaseDate: row.mapped.purchaseDate,
        warrantyExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        branchId: matchedBranch.id,
        branchName: matchedBranch.name,
        assignedToUserName: row.mapped.assignedTo || undefined,
        imageUrl: '',
        notes: `Imported via spreadsheet on ${new Date().toLocaleDateString()}`
      };

      finalAssetsToImport.push(newAsset);
    });

    if (finalAssetsToImport.length > 0) {
      onBulkAddAssets(finalAssetsToImport);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex flex-col items-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-6 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  Data Migration & Fleet Import Studio
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Excel & CSV
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Interactive column mapping, pre-flight duplicate checking, and batch TiDB database ingestion
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Sample Template</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-2 text-xs font-semibold">
          <div className={`flex items-center gap-2 ${step === 'UPLOAD' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 'UPLOAD' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800'}`}>1</span>
            <span>Upload File</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-600" />
          <div className={`flex items-center gap-2 ${step === 'MAP' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 'MAP' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800'}`}>2</span>
            <span>Map Columns</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-600" />
          <div className={`flex items-center gap-2 ${step === 'PREVIEW' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 'PREVIEW' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800'}`}>3</span>
            <span>Validation & Ingestion</span>
          </div>
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 'UPLOAD' && (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-3xl p-10 bg-slate-950/50 transition-colors">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-100 mb-1">
              Select or Drag & Drop Asset Spreadsheet
            </h3>
            <p className="text-xs text-slate-400 text-center max-w-sm mb-6">
              Supports Microsoft Excel (.xlsx, .xls) and standard CSV files with automatic column detection
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              {isProcessing ? 'Reading file...' : 'Browse Computer'}
            </button>
          </div>
        )}

        {/* STEP 2: MAP COLUMNS */}
        {step === 'MAP' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-200">{fileName}</span>
                <span className="text-slate-500">({rawRows.length} rows detected)</span>
              </div>
              {sheetNames.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Sheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
                  >
                    {sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="text-xs text-slate-400">
              Match the columns from your uploaded spreadsheet to OmniAsset system attributes:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 max-h-[340px] overflow-y-auto pr-1">
              {[
                { key: 'name', label: 'Device Model / Name', required: true },
                { key: 'assetCode', label: 'Asset Tag / Code', required: false, hint: 'Auto-generated if empty' },
                { key: 'serialNumber', label: 'Hardware Serial #', required: false },
                { key: 'category', label: 'Hardware Category', required: false },
                { key: 'purchaseCost', label: 'Purchase Cost / Price', required: false },
                { key: 'purchaseDate', label: 'Purchase Date', required: false },
                { key: 'branchName', label: 'Branch / Location', required: false },
                { key: 'departmentName', label: 'Department', required: false },
                { key: 'assignedTo', label: 'Assigned User / Custodian', required: false },
                { key: 'status', label: 'Status (ACTIVE/SPARE)', required: false },
                { key: 'condition', label: 'Condition (NEW/GOOD)', required: false }
              ].map(field => {
                const currentVal = mapping[field.key as keyof ColumnMapping];
                return (
                  <div key={field.key} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-200">
                        {field.label} {field.required && <span className="text-rose-400">*</span>}
                      </span>
                      {currentVal && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <select
                      value={currentVal}
                      onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer ${
                        currentVal ? 'border-emerald-500/40 text-emerald-300' : 'border-slate-800 text-slate-500'
                      }`}
                    >
                      <option value="">-- Ignore / Not in file --</option>
                      {rawHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep('UPLOAD')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Back to Upload
              </button>
              <button
                onClick={() => setStep('PREVIEW')}
                disabled={!mapping.name}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                Review & Pre-Flight Validation
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PREVIEW & INGESTION */}
        {step === 'PREVIEW' && (
          <div className="flex flex-col gap-4">
            {/* Metric summaries */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 font-medium">Valid Ready Rows</span>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">{validCount}</div>
                </div>
                <CheckCircle2 className="w-6 h-6 text-emerald-400/80" />
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 font-medium">Conflicting Duplicates</span>
                  <div className="text-lg font-black text-amber-400 mt-0.5">{duplicateCount}</div>
                </div>
                <AlertTriangle className="w-6 h-6 text-amber-400/80" />
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 font-medium">Incomplete Rows</span>
                  <div className="text-lg font-black text-rose-400 mt-0.5">{invalidCount}</div>
                </div>
                <AlertCircle className="w-6 h-6 text-rose-400/80" />
              </div>
            </div>

            {/* Duplicate strategy selector */}
            {duplicateCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{duplicateCount} serial number/tag conflicts found. Choose resolution:</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDuplicateStrategy('SKIP')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      duplicateStrategy === 'SKIP' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Skip Duplicates
                  </button>
                  <button
                    onClick={() => setDuplicateStrategy('RENAME_TAG')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      duplicateStrategy === 'RENAME_TAG' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Generate New Tag
                  </button>
                </div>
              </div>
            )}

            {/* Preview table */}
            <div className="border border-slate-800 rounded-2xl overflow-hidden max-h-60 overflow-y-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] sticky top-0">
                  <tr>
                    <th className="p-2.5">Row</th>
                    <th className="p-2.5">Device Name</th>
                    <th className="p-2.5">Asset Tag</th>
                    <th className="p-2.5">Serial #</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Branch</th>
                    <th className="p-2.5">Cost</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                  {parsedRows.slice(0, 50).map(row => (
                    <tr key={row.index} className="hover:bg-slate-800/40">
                      <td className="p-2.5 font-mono text-slate-500">#{row.index}</td>
                      <td className="p-2.5 font-bold text-slate-200">{row.mapped.name}</td>
                      <td className="p-2.5 font-mono text-emerald-400">{row.mapped.assetCode}</td>
                      <td className="p-2.5 font-mono text-slate-300">{row.mapped.serialNumber || '-'}</td>
                      <td className="p-2.5 text-slate-400">{row.mapped.category}</td>
                      <td className="p-2.5 text-slate-400">{row.mapped.branchName}</td>
                      <td className="p-2.5 font-mono text-slate-300">${row.mapped.purchaseCost.toFixed(2)}</td>
                      <td className="p-2.5">
                        {row.isDuplicateSerial || row.isDuplicateTag ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            Duplicate
                          </span>
                        ) : !row.isValid ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Invalid
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep('MAP')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Back to Column Mapping
              </button>
              <button
                onClick={handleCommitImport}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>Import {duplicateStrategy === 'SKIP' ? validCount : validCount + duplicateCount} Assets to TiDB</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

