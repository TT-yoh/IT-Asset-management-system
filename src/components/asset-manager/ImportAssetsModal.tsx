import React, { useState, useRef } from 'react';
import { Asset, Branch, AssetCategory, Organization, AssetStatus } from '../../types';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { calculateStraightLineDepreciation } from '../../../shared/finance';
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
  Database,
  Loader2
} from 'lucide-react';

/**
 * Addendum 4 Section D2: Robust cell extraction
 * Decodes formulas, richText, hyperlinks, dates, numbers, booleans.
 * Never outputs "[object Object]".
 */
function extractCellValue(raw: any): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (raw instanceof Date) {
    return raw.toISOString().split('T')[0]!;
  }
  if (typeof raw === 'object') {
    if ('result' in raw && raw.result !== undefined && raw.result !== null) {
      return extractCellValue(raw.result);
    }
    if (Array.isArray(raw.richText)) {
      return raw.richText.map((item: any) => item?.text || '').join('').trim();
    }
    if ('text' in raw && typeof raw.text === 'string') {
      return raw.text.trim();
    }
    if ('hyperlink' in raw && typeof raw.hyperlink === 'string') {
      return raw.hyperlink.trim();
    }
  }
  return String(raw).trim();
}


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
  imeiNumber: string;
  macAddress: string;
  phoneNumber: string;
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
    imeiNumber: string;
    macAddress: string;
    phoneNumber: string;
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
  isDuplicateImei: boolean;
  isDuplicateMac: boolean;
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
    imeiNumber: '',
    macAddress: '',
    phoneNumber: '',
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
  const [uploadError, setUploadError] = useState<string>('');
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [serverReport, setServerReport] = useState<{ imported: number; skipped: number; errors: string[]; warnings: string[] } | null>(null);
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
      imeiNumber: findBestHeader(['imei', 'imeinumber', 'meid', 'cellularid', 'simimei']),
      macAddress: findBestHeader(['macaddress', 'mac', 'ethernetmac', 'wifimac', 'physicaladdress']),
      phoneNumber: findBestHeader(['phonenumber', 'phone', 'mobile', 'msisdn', 'line', 'cell', 'simnumber']),
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

  /**
   * Addendum 4 Section D1 & D2:
   * Unified loader pipeline (.xlsx via exceljs, .csv via papaparse).
   * Enforces 2 MB, 500 rows, 30 columns, 500 chars/cell limits.
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setUploadError('');
    setServerReport(null);
    setIsProcessing(true);

    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('File exceeds the 2 MB maximum size limit.');
      }

      const lowerName = file.name.toLowerCase();
      const isCsv = lowerName.endsWith('.csv') || file.type === 'text/csv';

      let headers: string[] = [];
      let rows: Record<string, any>[] = [];

      if (isCsv) {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, any>>(text, {
          header: true,
          skipEmptyLines: 'greedy'
        });

        if (parsed.errors && parsed.errors.length > 0 && parsed.data.length === 0) {
          throw new Error('CSV parsing error: ' + parsed.errors[0]?.message);
        }

        headers = (parsed.meta.fields || []).map(h => extractCellValue(h));
        rows = parsed.data.map((r, rowIdx) => {
          const rowObj: Record<string, any> = {};
          headers.forEach(h => {
            const val = extractCellValue(r[h]);
            if (val.length > 500) {
              throw new Error(`Row ${rowIdx + 1}, column "${h}" exceeds the 500 characters per cell limit.`);
            }
            rowObj[h] = val;
          });
          return rowObj;
        });
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const sheets = workbook.worksheets.map(w => w.name);
        setSheetNames(sheets);

        const firstSheetName = sheets[0] || '';
        setSelectedSheet(firstSheetName);

        const worksheet = workbook.getWorksheet(firstSheetName) || workbook.worksheets[0];
        if (!worksheet) {
          throw new Error('No worksheets found in uploaded Excel file.');
        }

        const rawH: string[] = [];
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          rawH[colNumber] = extractCellValue(cell.value);
        });

        headers = rawH.filter(Boolean);

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const rowObj: Record<string, any> = {};
          headers.forEach((h, idx) => {
            const cellVal = extractCellValue(row.getCell(idx + 1).value);
            if (cellVal.length > 500) {
              throw new Error(`Row ${rowNumber}, column "${h}" exceeds the 500 characters per cell limit.`);
            }
            rowObj[h] = cellVal;
          });
          if (Object.values(rowObj).some(v => v !== '')) {
            rows.push(rowObj);
          }
        });
      }

      if (headers.length > 30) {
        throw new Error(`File contains ${headers.length} columns, exceeding the maximum allowed limit of 30 columns.`);
      }

      if (rows.length > 500) {
        throw new Error(`File contains ${rows.length} rows, exceeding the maximum allowed limit of 500 rows.`);
      }

      if (rows.length === 0) {
        throw new Error('Spreadsheet contains zero data rows.');
      }

      setRawHeaders(headers);
      setRawRows(rows);
      setMapping(autoDetectMapping(headers));
      setStep('MAP');
    } catch (err: any) {
      console.error('Failed to parse spreadsheet file:', err);
      setUploadError(err.message || 'Could not parse spreadsheet file. Please verify it is a valid .xlsx or .csv.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Download official sample Excel template
  const handleDownloadTemplate = async () => {
    const sampleData = [
      {
        'Asset Name': 'MacBook Pro 16" M3 Max',
        'Asset Tag': 'OMNI-LPT-901',
        'Serial Number': 'C02G8901M3X',
        'IMEI': '',
        'MAC Address': '3c:22:fb:1a:88:90',
        'Phone Line': '',
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
        'Asset Name': 'iPhone 15 Pro 256GB',
        'Asset Tag': 'OMNI-PHN-204',
        'Serial Number': '',
        'IMEI': '359245108920194',
        'MAC Address': 'f4:34:f0:88:91:ab',
        'Phone Line': '+1 (555) 392-8192',
        'Category': 'Phones & Tablets',
        'Purchase Cost': 1199.00,
        'Purchase Date': '2024-02-10',
        'Location': branches[0]?.name || 'Main HQ',
        'Department': 'Executive',
        'Assigned To': 'ceo@omnicorp.com',
        'Status': 'ACTIVE',
        'Condition': 'NEW'
      },
      {
        'Asset Name': 'Cisco Catalyst 9300 Switch',
        'Asset Tag': 'OMNI-NET-801',
        'Serial Number': 'FOC2439L901',
        'IMEI': '',
        'MAC Address': '00:1A:2B:3C:4D:5E',
        'Phone Line': '',
        'Category': 'Networking',
        'Purchase Cost': 3200.00,
        'Purchase Date': '2023-08-05',
        'Location': branches[0]?.name || 'Main HQ',
        'Department': 'IT Operations',
        'Assigned To': '',
        'Status': 'ACTIVE',
        'Condition': 'GOOD'
      },
      {
        'Asset Name': 'Dell UltraSharp 27" 4K',
        'Asset Tag': 'OMNI-MON-442',
        'Serial Number': 'CN-0Y3K2M-12',
        'IMEI': '',
        'MAC Address': '',
        'Phone Line': '',
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
        'Asset Name': 'Logitech MX Master 3S Bundle',
        'Asset Tag': 'OMNI-PER-301',
        'Serial Number': '',
        'IMEI': '',
        'MAC Address': '',
        'Phone Line': '',
        'Category': 'Peripherals',
        'Purchase Cost': 199.00,
        'Purchase Date': '2024-03-01',
        'Location': branches[0]?.name || 'Main HQ',
        'Department': 'Engineering',
        'Assigned To': '',
        'Status': 'SPARE',
        'Condition': 'NEW'
      }
    ];

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Asset_Inventory');
    const headers = Object.keys(sampleData[0]);
    ws.columns = headers.map(h => ({ header: h, key: h }));
    sampleData.forEach(d => ws.addRow(d));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'OmniAsset_Import_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Validate and parse mapped rows
  const parsedRows: ParsedRow[] = rawRows.map((row, idx) => {
    const errors: string[] = [];
    const name = String(row[mapping.name] || '').trim();
    if (!name) errors.push('Device Name is required');

    const rawCategory = String(row[mapping.category] || '').trim();
    const matchedCategory = categories.find(c => c.name.toLowerCase() === rawCategory.toLowerCase() || c.id === rawCategory);
    if (!rawCategory) {
      errors.push('Category is required');
    } else if (!matchedCategory) {
      errors.push(`Unknown category "${rawCategory}". Must match an existing category.`);
    }
    const category = matchedCategory ? matchedCategory.name : rawCategory;

    const rawBranch = String(row[mapping.branchName] || '').trim();
    const matchedBranch = branches.find(b => b.name.toLowerCase() === rawBranch.toLowerCase() || b.id === rawBranch);
    if (!rawBranch) {
      errors.push('Branch / Location is required');
    } else if (!matchedBranch) {
      errors.push(`Unknown branch "${rawBranch}". Must match an existing branch in your organization.`);
    }
    const branchName = matchedBranch ? matchedBranch.name : rawBranch;

    let assetCode = String(row[mapping.assetCode] || '').trim();
    if (!assetCode) {
      const catPrefix = (category || 'AST').slice(0, 3).toUpperCase();
      assetCode = `OMNI-${catPrefix}-${String(100 + idx).padStart(3, '0')}`;
    }

    const serialNumber = String(row[mapping.serialNumber] || '').trim();
    const imeiNumber = String(row[mapping.imeiNumber] || '').trim();
    const macAddress = String(row[mapping.macAddress] || '').trim();
    const phoneNumber = String(row[mapping.phoneNumber] || '').trim();

    // Check duplicates against existing assets
    const isDuplicateSerial = Boolean(
      serialNumber && existingAssets.some(a => a.serialNumber && a.serialNumber.toLowerCase() === serialNumber.toLowerCase())
    );

    const isDuplicateTag = existingAssets.some(
      a => a.assetCode.toLowerCase() === assetCode.toLowerCase()
    );

    const cleanImei = imeiNumber.replace(/[^0-9]/g, '');
    const isDuplicateImei = Boolean(
      cleanImei && existingAssets.some(a => a.imeiNumber && a.imeiNumber.replace(/[^0-9]/g, '') === cleanImei)
    );

    const cleanMac = macAddress.toLowerCase().replace(/[^a-f0-9]/g, '');
    const isDuplicateMac = Boolean(
      cleanMac && existingAssets.some(a => a.macAddress && a.macAddress.toLowerCase().replace(/[^a-f0-9]/g, '') === cleanMac)
    );

    // Number conversion for cost
    let purchaseCost = 0;
    const rawCost = String(row[mapping.purchaseCost] || '').replace(/[^0-9.-]+/g, '');
    if (rawCost) {
      const num = parseFloat(rawCost);
      if (!isNaN(num)) purchaseCost = Math.max(0, num);
    }

    let purchaseDate = String(row[mapping.purchaseDate] || '').trim();
    if (!purchaseDate) {
      purchaseDate = new Date().toISOString().split('T')[0]!;
    }

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
        imeiNumber,
        macAddress,
        phoneNumber,
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
      isDuplicateTag,
      isDuplicateImei,
      isDuplicateMac
    };
  });

  // Count summaries
  const validCount = parsedRows.filter(r => r.isValid && !r.isDuplicateSerial && !r.isDuplicateTag && !r.isDuplicateImei && !r.isDuplicateMac).length;
  const duplicateCount = parsedRows.filter(r => r.isDuplicateSerial || r.isDuplicateTag || r.isDuplicateImei || r.isDuplicateMac).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  /**
   * Addendum 4 Section D3: Authoritative Server-side Bulk Import
   * Dispatches rows to POST /api/assets/bulk, renders per-row failure report.
   */
  const handleCommitImport = async () => {
    setIsCommitting(true);
    setServerReport(null);

    const payloadAssets: any[] = [];
    let skipped = 0;

    parsedRows.forEach((row, i) => {
      if (!row.isValid) {
        skipped++;
        return;
      }

      const hasDuplicateConflict = row.isDuplicateSerial || row.isDuplicateTag || row.isDuplicateImei || row.isDuplicateMac;
      if (hasDuplicateConflict && duplicateStrategy === 'SKIP') {
        skipped++;
        return;
      }

      let finalCode = row.mapped.assetCode;
      if (hasDuplicateConflict && duplicateStrategy === 'RENAME_TAG') {
        finalCode = `${finalCode}-DUP${i + 1}`;
      }

      const matchedCat = categories.find(c => c.name.toLowerCase() === row.mapped.category.toLowerCase() || c.id === row.mapped.category);
      const matchedBranch = branches.find(b => b.name.toLowerCase() === row.mapped.branchName.toLowerCase() || b.id === row.mapped.branchName);

      if (!matchedCat || !matchedBranch) {
        skipped++;
        return;
      }

      // Serial number handling
      let fallbackSerial = row.mapped.serialNumber;
      if (!fallbackSerial) {
        if (row.mapped.imeiNumber) {
          fallbackSerial = `IMEI-${row.mapped.imeiNumber}`;
        } else if (row.mapped.macAddress) {
          fallbackSerial = `MAC-${row.mapped.macAddress.replace(/[^a-zA-Z0-9]/g, '')}`;
        } else {
          fallbackSerial = `TAG-${finalCode}`;
        }
      }

      // Calculate straight-line depreciation using shared/finance.ts
      const usefulMonths = Math.max(12, (matchedCat.depreciationYears || 3) * 12);
      const depResult = calculateStraightLineDepreciation(row.mapped.purchaseCost, row.mapped.purchaseDate, {
        usefulLifeMonths: usefulMonths
      });

      payloadAssets.push({
        name: row.mapped.name,
        model: row.mapped.name,
        categoryId: matchedCat.id,
        categoryName: matchedCat.name,
        branchId: matchedBranch.id,
        branchName: matchedBranch.name,
        assetCode: finalCode,
        serialNumber: fallbackSerial,
        imeiNumber: row.mapped.imeiNumber || undefined,
        macAddress: row.mapped.macAddress || undefined,
        phoneNumber: row.mapped.phoneNumber || undefined,
        status: row.mapped.status,
        condition: row.mapped.condition,
        purchaseCost: row.mapped.purchaseCost,
        currentValue: depResult.bookValue,
        costSource: 'MANUAL',
        purchaseDate: row.mapped.purchaseDate,
        warrantyExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        notes: `Imported via spreadsheet on ${new Date().toLocaleDateString()}`
      });
    });

    if (payloadAssets.length === 0) {
      setServerReport({
        imported: 0,
        skipped: parsedRows.length,
        errors: ['No valid asset rows to import. Please review row validation errors.'],
        warnings: []
      });
      setIsCommitting(false);
      return;
    }

    try {
      const res = await fetch('/api/assets/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({ assets: payloadAssets })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server rejected bulk asset intake.');
      }

      setServerReport({
        imported: data.imported || 0,
        skipped: data.skipped || 0,
        errors: data.errors || [],
        warnings: data.warnings || []
      });

      if (data.imported > 0) {
        // Build mock typed assets for immediate client view update
        const importedList: Asset[] = payloadAssets.slice(0, data.imported).map((item, idx) => ({
          id: `ast-${Date.now()}-${idx}`,
          orgId: organization.id,
          ...item,
          imageUrl: ''
        }));
        onBulkAddAssets(importedList);
      }
    } catch (err: any) {
      setServerReport({
        imported: 0,
        skipped: parsedRows.length,
        errors: [err.message || 'Bulk import failed. Please check connection and try again.'],
        warnings: []
      });
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div data-modal-overlay className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex flex-col items-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-6 my-4 sm:my-8">
        
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
            {uploadError && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2 max-w-md">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{uploadError}</span>
              </div>
            )}
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
                { key: 'assetCode', label: 'Asset Tag / Code', required: false },
                { key: 'serialNumber', label: 'Hardware Serial # (PCs/Laptops)', required: false },
                { key: 'imeiNumber', label: 'Cellular IMEI (Phones/Tablets)', required: false },
                { key: 'phoneNumber', label: 'Corporate SIM / Phone #', required: false },
                { key: 'macAddress', label: 'Network MAC Address (Switches/APs)', required: false },
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
                    <th className="p-2.5">Hardware Identifier</th>
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
                      <td className="p-2.5 font-mono text-slate-300">
                        {row.mapped.imeiNumber ? (
                          <div className="text-amber-400 font-semibold">IMEI: {row.mapped.imeiNumber}</div>
                        ) : row.mapped.macAddress ? (
                          <div className="text-cyan-400 font-semibold">MAC: {row.mapped.macAddress}</div>
                        ) : row.mapped.serialNumber ? (
                          <div>S/N: {row.mapped.serialNumber}</div>
                        ) : (
                          <div className="text-slate-500 italic">Tag Tracked</div>
                        )}
                        {row.mapped.phoneNumber && (
                          <div className="text-[10px] text-slate-400 font-sans">📞 {row.mapped.phoneNumber}</div>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-400">{row.mapped.category}</td>
                      <td className="p-2.5 text-slate-400">{row.mapped.branchName}</td>
                      <td className="p-2.5 font-mono text-slate-300">${row.mapped.purchaseCost.toFixed(2)}</td>
                      <td className="p-2.5">
                        {row.isDuplicateSerial || row.isDuplicateTag || row.isDuplicateImei || row.isDuplicateMac ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            Duplicate {row.isDuplicateImei ? 'IMEI' : row.isDuplicateMac ? 'MAC' : row.isDuplicateSerial ? 'S/N' : 'Tag'}
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

            {/* Server Ingestion Report Banner */}
            {serverReport && (
              <div className={`p-4 rounded-2xl border space-y-2 animate-in fade-in ${
                serverReport.errors.length > 0
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}>
                <div className="flex items-center justify-between font-bold text-xs">
                  <div className="flex items-center gap-2">
                    {serverReport.errors.length > 0 ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    <span>Batch Intake Complete: {serverReport.imported} assets imported, {serverReport.skipped} skipped</span>
                  </div>
                  <button
                    onClick={onClose}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs"
                  >
                    Close Window
                  </button>
                </div>
                {serverReport.errors.length > 0 && (
                  <div className="text-[11px] font-mono space-y-1 max-h-32 overflow-y-auto text-rose-400 pt-1">
                    {serverReport.errors.map((err, i) => (
                      <div key={i}>• {err}</div>
                    ))}
                  </div>
                )}
                {serverReport.warnings.length > 0 && (
                  <div className="text-[11px] font-mono space-y-1 max-h-24 overflow-y-auto text-amber-400 pt-1">
                    {serverReport.warnings.map((w, i) => (
                      <div key={i}>⚠️ {w}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep('MAP')}
                disabled={isCommitting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Back to Column Mapping
              </button>
              <button
                onClick={handleCommitImport}
                disabled={isCommitting || (validCount === 0 && duplicateStrategy === 'SKIP')}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Transacting to TiDB Cloud...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Import {duplicateStrategy === 'SKIP' ? validCount : validCount + duplicateCount} Assets to TiDB</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

