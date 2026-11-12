import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { Asset, MaintenanceRecord, BudgetAllocation } from '../types';
import pkg from '../../package.json';
import {
  calculateStraightLineDepreciation,
  calculateAgeMonths,
  normalizeCondition,
  AssetCondition
} from '../../shared/finance';

export const APP_VERSION = pkg.version || '1.0.0';

/**
 * Filter assets by branch and org_id
 */
export function getAssetsByBranch(branch_id?: string, org_id?: string, assetList: Asset[] = []): Asset[] {
  return assetList.filter(asset => {
    const matchOrg = org_id ? asset.orgId === org_id : true;
    const matchBranch = branch_id ? asset.branchId === branch_id : true;
    return matchOrg && matchBranch;
  });
}

/**
 * Calculate total value of active assets in organization/branch.
 * Excludes DISPOSED, SOLD, and DEPRECATED assets by default (D4).
 */
export function calculateTotalAssetValue(
  org_id?: string,
  branch_id?: string,
  assetList: Asset[] = [],
  includeDisposed = false
): number {
  const filtered = getAssetsByBranch(branch_id, org_id, assetList);
  return filtered
    .filter(asset => includeDisposed || !['DISPOSED', 'SOLD', 'DEPRECATED'].includes(String(asset.status || '').toUpperCase()))
    .reduce((sum, asset) => sum + (asset.currentValue ?? asset.purchaseCost ?? 0), 0);
}

/**
 * Group assets by condition using canonical enum: NEW, GOOD, FAIR, POOR (D5)
 */
export function getAssetsByCondition(org_id?: string, assetList: Asset[] = []): Record<AssetCondition, number> {
  const filtered = assetList.filter(a => !org_id || a.orgId === org_id);
  const result: Record<AssetCondition, number> = { NEW: 0, GOOD: 0, FAIR: 0, POOR: 0 };

  filtered.forEach(asset => {
    const cond = normalizeCondition(asset.condition);
    result[cond] = (result[cond] || 0) + 1;
  });

  return result;
}

/**
 * Analyze assets by age group using exact month calculations
 */
export function getAssetsByAge(org_id?: string, assetList: Asset[] = []): Record<string, number> {
  const filtered = assetList.filter(a => !org_id || a.orgId === org_id);
  const result = {
    '0-1 Year': 0,
    '1-3 Years': 0,
    '3-5 Years': 0,
    '5+ Years': 0
  };

  const now = new Date();
  filtered.forEach(asset => {
    const ageMonths = calculateAgeMonths(asset.purchaseDate, now);
    const ageYears = ageMonths / 12;
    if (ageYears <= 1) result['0-1 Year']++;
    else if (ageYears <= 3) result['1-3 Years']++;
    else if (ageYears <= 5) result['3-5 Years']++;
    else result['5+ Years']++;
  });

  return result;
}

/**
 * Calculate depreciation details for a single asset using shared straight-line module
 */
export function calculateDepreciation(
  asset: Asset,
  method: 'STRAIGHT_LINE' | 'DOUBLE_DECLINING' = 'STRAIGHT_LINE',
  usefulLifeYears = 5,
  salvageValueFactor = 0.1
) {
  const usefulLifeMonths = usefulLifeYears * 12;
  const dep = calculateStraightLineDepreciation(asset.purchaseCost || 0, asset.purchaseDate, {
    usefulLifeMonths,
    salvageFactor: salvageValueFactor
  });

  const annualDep = usefulLifeYears > 0 ? dep.depreciableBase / usefulLifeYears : 0;

  return {
    annualDepreciation: Math.round(annualDep),
    accumulatedDepreciation: Math.round(dep.accumulatedDepreciation),
    bookValue: Math.round(dep.bookValue)
  };
}

/**
 * Analyze maintenance cost breakdown derived strictly from actual records.
 * Zero fabricated numbers or fixed percentage multipliers (D2).
 */
export function getMaintenanceCostAnalysis(
  org_id?: string,
  date_range?: string,
  maintenanceList: MaintenanceRecord[] = [],
  assetList: Asset[] = []
) {
  const filteredRecords = maintenanceList.filter(rec => {
    const asset = assetList.find(a => a.id === rec.assetId);
    if (!asset) return false;
    if (org_id && asset.orgId !== org_id) return false;
    if (date_range && date_range !== 'ALL') {
      return (rec.startDate && rec.startDate.includes(date_range)) ||
             (rec.expectedCompletion && rec.expectedCompletion.includes(date_range));
    }
    return true;
  });

  const costByCategory: Record<string, number> = {};
  const monthlyCostMap = new Map<string, number>();

  let totalCost = 0;
  let preventiveCount = 0;
  let reactiveCount = 0;
  let preventiveCost = 0;
  let reactiveCost = 0;
  let totalRepairTime = 0;
  let completedCount = 0;

  filteredRecords.forEach(rec => {
    const asset = assetList.find(a => a.id === rec.assetId);
    const category = asset?.categoryName || 'General';
    const cost = Number(rec.cost) || 0;

    costByCategory[category] = (costByCategory[category] || 0) + cost;
    totalCost += cost;

    if (rec.type === 'INSPECTION' || rec.type === 'UPGRADE') {
      preventiveCount++;
      preventiveCost += cost;
    } else {
      reactiveCount++;
      reactiveCost += cost;
    }

    // Real repair time calculation based on actual start and completion dates
    if (rec.status === 'COMPLETED' && rec.startDate && rec.actualCompletion) {
      const s = new Date(rec.startDate).getTime();
      const e = new Date(rec.actualCompletion).getTime();
      if (!isNaN(s) && !isNaN(e) && e >= s) {
        const hours = Math.round((e - s) / (1000 * 3600));
        totalRepairTime += hours;
        completedCount++;
      }
    }

    // Group real monthly costs
    const dateStr = rec.actualCompletion || rec.startDate || '';
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const monthKey = d.toLocaleString('en-US', { month: 'short' });
        monthlyCostMap.set(monthKey, (monthlyCostMap.get(monthKey) || 0) + cost);
      }
    }
  });

  const averageRepairTime = completedCount > 0 ? Math.round(totalRepairTime / completedCount) : null;

  // Real monthly trend from recorded transactions
  const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyTrend = monthOrder
    .filter(m => monthlyCostMap.has(m))
    .map(name => ({
      name,
      cost: Math.round(monthlyCostMap.get(name) || 0)
    }));

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    costByCategory,
    averageRepairTime,
    preventiveCount,
    reactiveCount,
    preventiveCost: Math.round(preventiveCost * 100) / 100,
    reactiveCost: Math.round(reactiveCost * 100) / 100,
    monthlyTrend,
    forecast: [] as { name: string; cost: number }[]
  };
}

/**
 * Budget Utilization report derived from active allocations.
 * Burn rate computed from actual elapsed calendar months (D2).
 */
export function getBudgetUtilization(
  org_id?: string,
  fiscal_year?: string,
  budgetList: BudgetAllocation[] = [],
  _maintenanceList?: MaintenanceRecord[],
  _assetList?: Asset[]
) {
  const filteredBudgets = budgetList.filter(b => {
    const matchOrg = !org_id || b.orgId === org_id;
    const matchYr = !fiscal_year || String(b.fiscalYear) === fiscal_year;
    return matchOrg && matchYr;
  });

  const allocated = filteredBudgets.reduce((sum, b) => sum + (Number(b.allocated) || 0), 0);
  const spent = filteredBudgets.reduce((sum, b) => sum + (Number(b.spent) || 0), 0);
  const remaining = Math.max(0, allocated - spent);

  const utilizationByCategory = filteredBudgets.map(b => ({
    category: b.departmentName,
    allocated: b.allocated,
    spent: b.spent,
    remaining: b.allocated - b.spent,
    percentage: b.allocated > 0 ? Math.round((b.spent / b.allocated) * 100) : 0
  }));

  // Real elapsed months in current calendar year (1-12)
  const currentElapsedMonths = Math.max(1, new Date().getMonth() + 1);
  const burnRateMonthly = Math.round((spent / currentElapsedMonths) * 100) / 100;

  return {
    allocated: Math.round(allocated * 100) / 100,
    spent: Math.round(spent * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    utilizationByCategory,
    burnRateMonthly,
    forecastSpent: Math.round(burnRateMonthly * 12 * 100) / 100
  };
}

/**
 * Sanitizes input data against CSV / Formula Injection (CWE-1236).
 * Pre-emptively escapes cells starting with formula trigger characters: '=', '+', '-', '@', '\t', '\r'.
 */
export function sanitizeForFormulaInjection(val: any): any {
  if (typeof val === 'string') {
    if (/^[=+\-@\t\r]/.test(val)) {
      return `'${val}`;
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeForFormulaInjection);
  }
  if (val && typeof val === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      cleaned[k] = sanitizeForFormulaInjection(v);
    }
    return cleaned;
  }
  return val;
}

export const escapeCsvField = (val: any) => sanitizeForFormulaInjection(val);

/**
 * Export data to Microsoft Excel with Formula Injection Protection (ExcelJS)
 * Neutralizes double .xlsx extension bug (D7).
 */
export async function exportToExcel(data: any[], filename: string) {
  const sanitized = Array.isArray(data) ? data.map(item => sanitizeForFormulaInjection(item)) : [];
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report Data');

  if (sanitized.length > 0) {
    const keys = Object.keys(sanitized[0]);
    worksheet.columns = keys.map(k => ({ header: k, key: k }));
    sanitized.forEach(item => worksheet.addRow(item));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // Prevent double .xlsx extension
  const cleanName = filename.replace(/(\.xlsx)+$/i, '');
  a.download = `${cleanName}.xlsx`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export data to PDF using jsPDF
 * Neutralizes double .pdf extension bug and embeds real app version from package.json (D7, D9).
 */
export function exportToPDF(data: any[], filename: string, title = 'REPORTS AND ANALYTICS') {
  const doc = new jsPDF();

  // Header
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 118, 110); // emerald-700
  doc.text(title, 14, 22);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
  doc.text(`Asset Management System v${APP_VERSION}`, 14, 33);

  // Line separator
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 38, 196, 38);

  // Table header
  let y = 46;
  if (data.length > 0) {
    const keys = Object.keys(data[0]).slice(0, 5); // Take first 5 columns to fit width
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);

    let x = 14;
    const colWidth = 36;
    keys.forEach(key => {
      doc.text(key.toUpperCase().replace('_', ' '), x, y);
      x += colWidth;
    });

    doc.line(14, y + 2, 196, y + 2);
    y += 8;

    // Table rows
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    data.forEach(row => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      let x = 14;
      keys.forEach(key => {
        const val = String(row[key] ?? '');
        const truncated = val.length > 20 ? val.substring(0, 18) + '..' : val;
        doc.text(truncated, x, y);
        x += colWidth;
      });
      y += 7;
    });
  } else {
    doc.text('No matching record found.', 14, y);
  }

  // Prevent double .pdf extension
  const cleanName = filename.replace(/(\.pdf)+$/i, '');
  doc.save(`${cleanName}.pdf`);
}
