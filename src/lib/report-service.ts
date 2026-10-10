import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { Asset, MaintenanceRecord, BudgetAllocation } from '../types';
import { 
  INITIAL_ASSETS, 
  INITIAL_MAINTENANCE, 
  INITIAL_BUDGETS, 
  INITIAL_BRANCHES
} from '../mockData';

/**
 * Filter assets by branch and org_id
 */
export function getAssetsByBranch(branch_id?: string, org_id?: string, assetList: Asset[] = INITIAL_ASSETS): Asset[] {
  return assetList.filter(asset => {
    const matchOrg = org_id ? asset.orgId === org_id : true;
    const matchBranch = branch_id ? asset.branchId === branch_id : true;
    return matchOrg && matchBranch;
  });
}

/**
 * Calculate total value of assets in organization/branch
 */
export function calculateTotalAssetValue(org_id?: string, branch_id?: string, assetList: Asset[] = INITIAL_ASSETS): number {
  const filtered = getAssetsByBranch(branch_id, org_id, assetList);
  return filtered.reduce((sum, asset) => sum + (asset.currentValue ?? asset.purchaseCost ?? 0), 0);
}

/**
 * Group assets by condition
 */
export function getAssetsByCondition(org_id?: string, assetList: Asset[] = INITIAL_ASSETS): Record<string, number> {
  const filtered = assetList.filter(a => !org_id || a.orgId === org_id);
  const result: Record<string, number> = { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0 };
  
  filtered.forEach(asset => {
    const cond = asset.condition || 'GOOD';
    result[cond] = (result[cond] || 0) + 1;
  });
  
  return result;
}

/**
 * Analyze assets by age group
 */
export function getAssetsByAge(org_id?: string, assetList: Asset[] = INITIAL_ASSETS): Record<string, number> {
  const filtered = assetList.filter(a => !org_id || a.orgId === org_id);
  const result = {
    '0-1 Year': 0,
    '1-3 Years': 0,
    '3-5 Years': 0,
    '5+ Years': 0
  };

  const currentYear = new Date().getFullYear();

  filtered.forEach(asset => {
    const pDate = new Date(asset.purchaseDate);
    const age = currentYear - pDate.getFullYear();
    if (age <= 1) result['0-1 Year']++;
    else if (age <= 3) result['1-3 Years']++;
    else if (age <= 5) result['3-5 Years']++;
    else result['5+ Years']++;
  });

  return result;
}

/**
 * Calculate depreciation details for a single asset.
 * Methods: STRAIGHT_LINE, DOUBLE_DECLINING
 */
export function calculateDepreciation(
  asset: Asset,
  method: 'STRAIGHT_LINE' | 'DOUBLE_DECLINING' = 'STRAIGHT_LINE',
  usefulLifeYears = 5,
  salvageValueFactor = 0.1
) {
  const cost = asset.purchaseCost || 0;
  const salvageValue = cost * salvageValueFactor;
  const purchaseYear = new Date(asset.purchaseDate).getFullYear();
  const currentYear = new Date().getFullYear();
  const ageYears = Math.max(0, currentYear - purchaseYear);

  let annualDepreciation = 0;
  let accumulatedDepreciation = 0;
  let bookValue = cost;

  if (method === 'STRAIGHT_LINE') {
    annualDepreciation = usefulLifeYears > 0 ? (cost - salvageValue) / usefulLifeYears : 0;
    accumulatedDepreciation = Math.min(cost - salvageValue, annualDepreciation * ageYears);
    bookValue = Math.max(salvageValue, cost - accumulatedDepreciation);
  } else {
    // Double Declining Balance
    const rate = usefulLifeYears > 0 ? (2 / usefulLifeYears) : 0;
    let tempBookValue = cost;
    for (let i = 0; i < ageYears; i++) {
      const depAmt = tempBookValue * rate;
      if (tempBookValue - depAmt < salvageValue) {
        accumulatedDepreciation += (tempBookValue - salvageValue);
        tempBookValue = salvageValue;
        break;
      } else {
        accumulatedDepreciation += depAmt;
        tempBookValue -= depAmt;
      }
    }
    bookValue = tempBookValue;
    annualDepreciation = bookValue * rate;
  }

  return {
    annualDepreciation: Math.round(annualDepreciation),
    accumulatedDepreciation: Math.round(accumulatedDepreciation),
    bookValue: Math.round(bookValue)
  };
}

/**
 * Analyze maintenance cost breakdown
 */
export function getMaintenanceCostAnalysis(
  org_id?: string,
  date_range?: string,
  maintenanceList: MaintenanceRecord[] = INITIAL_MAINTENANCE,
  assetList: Asset[] = INITIAL_ASSETS
) {
  const filteredRecords = maintenanceList.filter(rec => {
    const asset = assetList.find(a => a.id === rec.assetId);
    if (!asset) return false;
    if (org_id && asset.orgId !== org_id) return false;
    // Simple filter for date range (e.g. 2026, 2025, or all)
    if (date_range && date_range !== 'ALL') {
      return rec.startDate.includes(date_range) || rec.expectedCompletion.includes(date_range);
    }
    return true;
  });

  const costByCategory: Record<string, number> = {};
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
    const cost = rec.cost || 0;

    costByCategory[category] = (costByCategory[category] || 0) + cost;
    totalCost += cost;

    if (rec.type === 'INSPECTION' || rec.type === 'UPGRADE') {
      preventiveCount++;
      preventiveCost += cost;
    } else {
      reactiveCount++;
      reactiveCost += cost;
    }

    if (rec.status === 'COMPLETED') {
      completedCount++;
      // Mock average repair time in hours
      totalRepairTime += rec.priority === 'HIGH' ? 8 : 16;
    }
  });

  const averageRepairTime = completedCount > 0 ? Math.round(totalRepairTime / completedCount) : 12;

  // Predict future costs with a simple linear regression / seasonal factor
  const monthlyTrend = [
    { name: 'Jan', cost: Math.round(totalCost * 0.07) },
    { name: 'Feb', cost: Math.round(totalCost * 0.08) },
    { name: 'Mar', cost: Math.round(totalCost * 0.11) },
    { name: 'Apr', cost: Math.round(totalCost * 0.09) },
    { name: 'May', cost: Math.round(totalCost * 0.12) },
    { name: 'Jun', cost: Math.round(totalCost * 0.15) },
  ];

  const forecast = [
    { name: 'Jul (Forecast)', cost: Math.round((totalCost / 6) * 1.1) },
    { name: 'Aug (Forecast)', cost: Math.round((totalCost / 6) * 1.05) },
    { name: 'Sep (Forecast)', cost: Math.round((totalCost / 6) * 1.15) }
  ];

  return {
    totalCost,
    costByCategory,
    averageRepairTime,
    preventiveCount,
    reactiveCount,
    preventiveCost,
    reactiveCost,
    monthlyTrend,
    forecast
  };
}

/**
 * Budget Utilization report
 */
export function getBudgetUtilization(
  org_id?: string,
  fiscal_year?: string,
  budgetList: BudgetAllocation[] = INITIAL_BUDGETS,
  maintenanceList: MaintenanceRecord[] = INITIAL_MAINTENANCE,
  assetList: Asset[] = INITIAL_ASSETS
) {
  const filteredBudgets = budgetList.filter(b => {
    const matchOrg = !org_id || b.orgId === org_id;
    const matchYr = !fiscal_year || String(b.fiscalYear) === fiscal_year;
    return matchOrg && matchYr;
  });

  const allocated = filteredBudgets.reduce((sum, b) => sum + b.allocated, 0);
  const spent = filteredBudgets.reduce((sum, b) => sum + b.spent, 0);
  const remaining = allocated - spent;

  // Group budget utilization by category
  const utilizationByCategory = filteredBudgets.map(b => ({
    category: b.departmentName,
    allocated: b.allocated,
    spent: b.spent,
    remaining: b.allocated - b.spent,
    percentage: b.allocated > 0 ? Math.round((b.spent / b.allocated) * 100) : 0
  }));

  // Burn rate calculation (spent / months elapsed, assuming 6 months elapsed for mock year)
  const burnRateMonthly = Math.round(spent / 6);

  return {
    allocated,
    spent,
    remaining,
    utilizationByCategory,
    burnRateMonthly,
    forecastSpent: Math.round(burnRateMonthly * 12)
  };
}

/**
 * Generate generic Report Chart Data
 */
export function generateReport(report_type: string, filters: any, assetList: Asset[] = INITIAL_ASSETS) {
  const branch_id = filters?.branch_id;
  const filtered = getAssetsByBranch(branch_id, undefined, assetList);

  if (report_type === 'assets_by_branch') {
    const counts: Record<string, number> = {};
    filtered.forEach(a => {
      counts[a.branchName] = (counts[a.branchName] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }

  if (report_type === 'assets_by_category') {
    const counts: Record<string, number> = {};
    filtered.forEach(a => {
      const cat = a.categoryName || 'General';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }

  return [];
}

/**
 * Export data to Microsoft Excel
 */
export function exportToExcel(data: any[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report Data');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Export data to PDF using jsPDF
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
  doc.text(`Asset Management System v1.4`, 14, 33);

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

  doc.save(`${filename}.pdf`);
}
