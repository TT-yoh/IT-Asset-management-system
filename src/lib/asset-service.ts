import { Asset, User, UserRole, CheckoutRecord, MaintenanceRecord, AuditLogItem } from '../types';
import { canAccessAsset } from './rbac';

export interface AssetFilters {
  branchIds?: string[];
  categoryIds?: string[];
  statuses?: string[];
  conditions?: string[];
  searchQuery?: string;
  page?: number;
  limit?: number;
}

export interface BulkUploadResult {
  successCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
  createdAssets: Asset[];
}

/**
 * File 10: src/lib/asset-service.ts
 * Core Asset Management Service Layer implementing CRUD operations, RBAC filtering, & Depreciation math.
 */
export class AssetService {
  /**
   * Calculate depreciated current value (Straight-Line 3-Year Standard IT depreciation)
   */
  static calculateCurrentValue(purchaseCost: number, purchaseDateStr: string, method: 'STRAIGHT_LINE' | 'DOUBLE_DECLINING' = 'STRAIGHT_LINE'): number {
    const pDate = new Date(purchaseDateStr);
    const now = new Date();
    const monthsElapsed = Math.max(0, (now.getFullYear() - pDate.getFullYear()) * 12 + (now.getMonth() - pDate.getMonth()));
    
    // Standard IT life = 36 months (3 years) with 10% residual scrap value
    const residualValue = purchaseCost * 0.10;
    const depreciableAmount = purchaseCost - residualValue;
    const monthlyDepreciation = depreciableAmount / 36;
    
    const totalDepreciation = Math.min(depreciableAmount, monthlyDepreciation * monthsElapsed);
    return Math.round(Math.max(residualValue, purchaseCost - totalDepreciation));
  }

  /**
   * Filter and paginate assets based on RBAC & multi-select query params
   */
  static getAssets(assetsPool: Asset[], filters: AssetFilters, orgId: string, user: User): { assets: Asset[]; total: number; page: number; totalPages: number } {
    let list = assetsPool.filter(a => a.orgId === orgId);

    // RBAC Custody & Branch checks
    if (user.role === 'USER' || user.role === 'BRANCH_MANAGER') {
      list = list.filter(a => a.branchId === user.branchId);
    }

    // Branch multi-select
    if (filters.branchIds && filters.branchIds.length > 0 && !filters.branchIds.includes('ALL')) {
      list = list.filter(a => filters.branchIds!.includes(a.branchId));
    }

    // Category multi-select
    if (filters.categoryIds && filters.categoryIds.length > 0 && !filters.categoryIds.includes('ALL')) {
      list = list.filter(a => filters.categoryIds!.includes(a.categoryId));
    }

    // Status filter
    if (filters.statuses && filters.statuses.length > 0 && !filters.statuses.includes('ALL')) {
      list = list.filter(a => filters.statuses!.includes(a.status));
    }

    // Condition filter
    if (filters.conditions && filters.conditions.length > 0 && !filters.conditions.includes('ALL')) {
      list = list.filter(a => filters.conditions!.includes(a.condition));
    }

    // Search text
    if (filters.searchQuery && filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase();
      list = list.filter(a => 
        a.name.toLowerCase().includes(q) || 
        a.assetCode.toLowerCase().includes(q) || 
        a.serialNumber.toLowerCase().includes(q) || 
        a.model.toLowerCase().includes(q) ||
        (a.phoneNumber && a.phoneNumber.toLowerCase().includes(q)) ||
        (a.registeredEmail && a.registeredEmail.toLowerCase().includes(q)) ||
        (a.imeiNumber && a.imeiNumber.toLowerCase().includes(q))
      );
    }

    const page = filters.page || 1;
    const limit = filters.limit || 12;
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const paginated = list.slice((page - 1) * limit, page * limit);

    return { assets: paginated, total, page, totalPages };
  }

  /**
   * Get single asset with permission check
   */
  static getAssetById(assetsPool: Asset[], assetId: string, orgId: string, user: User): Asset | null {
    const target = assetsPool.find(a => a.id === assetId && a.orgId === orgId);
    if (!target) return null;
    if (!canAccessAsset(user, target)) return null;
    return target;
  }

  /**
   * Validate & create asset (Only ADMIN & IT_SUPPORT)
   */
  static validateCreatePermissions(role: UserRole): boolean {
    return role === 'ADMIN' || role === 'IT_SUPPORT';
  }

  /**
   * Parse CSV bulk upload
   */
  static processBulkCSV(csvText: string, orgId: string, branchName: string): BulkUploadResult {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length <= 1) {
      return { successCount: 0, errorCount: 1, errors: [{ row: 1, message: 'CSV file is empty or missing headers' }], createdAssets: [] };
    }

    const headers = lines[0]!.toLowerCase().split(',').map(h => h.trim());
    const reqHeaders = ['name', 'model', 'serial_number', 'category', 'purchase_cost'];
    const missing = reqHeaders.filter(r => !headers.includes(r));

    if (missing.length > 0) {
      return { successCount: 0, errorCount: 1, errors: [{ row: 1, message: `Missing required CSV headers: ${missing.join(', ')}` }], createdAssets: [] };
    }

    const nameIdx = headers.indexOf('name');
    const modelIdx = headers.indexOf('model');
    const serialIdx = headers.indexOf('serial_number');
    const catIdx = headers.indexOf('category');
    const costIdx = headers.indexOf('purchase_cost');
    const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('purchased') || h.includes('acquired'));
    const conditionIdx = headers.findIndex(h => h.includes('condition'));
    const valueIdx = headers.findIndex(h => h.includes('current_value') || h.includes('book_value') || h.includes('current_val'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('number'));
    const emailIdx = headers.findIndex(h => h.includes('email'));

    const createdAssets: Asset[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const rowStr = lines[i]!.trim();
      if (!rowStr) continue;
      const cols = rowStr.split(',').map(c => c.trim());

      const name = cols[nameIdx] || '';
      const model = cols[modelIdx] || 'Standard IT Model';
      const serial = cols[serialIdx] || '';
      const cat = cols[catIdx] || 'Laptops';
      const costStr = cols[costIdx] || '1000';
      const cost = parseFloat(costStr) || 1000;
      const phoneVal = phoneIdx !== -1 ? cols[phoneIdx] : undefined;
      const emailVal = emailIdx !== -1 ? cols[emailIdx] : undefined;

      // Historical purchase date handling for preexisting assets
      let rawDate = dateIdx !== -1 ? cols[dateIdx] : undefined;
      let purchaseDate = new Date().toISOString().split('T')[0]!;
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) {
          purchaseDate = parsed.toISOString().split('T')[0]!;
        }
      }

      // Condition: explicit in CSV, or default based on age
      const rawCondition = conditionIdx !== -1 ? cols[conditionIdx]?.toUpperCase() : undefined;
      const condition: Asset['condition'] = (rawCondition === 'NEW' || rawCondition === 'GOOD' || rawCondition === 'FAIR' || rawCondition === 'POOR')
        ? rawCondition
        : (purchaseDate < new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]! ? 'GOOD' : 'NEW');

      // Current Value: explicit in CSV or auto-calculated via straight-line depreciation
      const explicitVal = valueIdx !== -1 ? parseFloat(cols[valueIdx]) : NaN;
      const currentValue = !isNaN(explicitVal)
        ? explicitVal
        : AssetService.calculateCurrentValue(cost, purchaseDate);

      if (!name || !serial) {
        errors.push({ row: i + 1, message: 'Name and Serial Number are mandatory' });
        continue;
      }

      const lowerCat = cat.toLowerCase();
      let categoryId = 'cat-lap';
      let categoryName = cat || 'Laptops & Ultrabooks';

      if (lowerCat.includes('key') || lowerCat.includes('mouse') || lowerCat.includes('mice') || lowerCat.includes('dock') || lowerCat.includes('periph') || lowerCat.includes('access') || lowerCat.includes('combo')) {
        categoryId = 'cat-periph';
        categoryName = 'Docks, Keyboards & Accessories';
      } else if (lowerCat.includes('phone') || lowerCat.includes('mobile') || lowerCat.includes('tablet') || lowerCat.includes('ipad')) {
        categoryId = 'cat-phone';
        categoryName = 'Smartphones & Mobile Fleet';
      } else if (lowerCat.includes('server') || lowerCat.includes('compute') || lowerCat.includes('blade') || lowerCat.includes('san') || lowerCat.includes('nas')) {
        categoryId = 'cat-servers';
        categoryName = 'Enterprise Servers & Compute';
      } else if (lowerCat.includes('mon') || lowerCat.includes('disp') || lowerCat.includes('screen') || lowerCat.includes('av')) {
        categoryId = 'cat-mon';
        categoryName = 'Monitors & AV Conferencing';
      } else if (lowerCat.includes('net') || lowerCat.includes('switch') || lowerCat.includes('router') || lowerCat.includes('firewall') || lowerCat.includes('wifi')) {
        categoryId = 'cat-net';
        categoryName = 'Networking & Security Gear';
      } else if (lowerCat.includes('print') || lowerCat.includes('scan') || lowerCat.includes('laserjet')) {
        categoryId = 'cat-print';
        categoryName = 'Printers & Fleet Scanners';
      } else if (lowerCat.includes('desk') || lowerCat.includes('workstation') || lowerCat.includes('imac') || lowerCat.includes('tower')) {
        categoryId = 'cat-desk';
        categoryName = 'Desktops & Workstations';
      } else if (lowerCat.includes('lap') || lowerCat.includes('note') || lowerCat.includes('macbook') || lowerCat.includes('thinkpad')) {
        categoryId = 'cat-lap';
        categoryName = 'Laptops & Ultrabooks';
      }

      const tagPrefix = categoryId === 'cat-periph' ? 'PERIPH' : cat.slice(0, 3).toUpperCase();

      const newAst: Asset = {
        id: `ast-csv-${Date.now()}-${i}`,
        orgId,
        branchId: 'branch-1',
        branchName,
        categoryId,
        categoryName,
        assetCode: `BULK-${tagPrefix}-${Math.floor(1000 + Math.random() * 9000)}`,
        name,
        model,
        serialNumber: serial,
        phoneNumber: phoneVal || undefined,
        registeredEmail: emailVal || undefined,
        status: 'ACTIVE',
        condition,
        purchaseDate,
        purchaseCost: cost,
        warrantyExpiry: new Date(Date.now() + 3 * 365 * 86400000).toISOString().split('T')[0]!,
        currentValue,
        imageUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600&auto=format&fit=crop&q=80',
        notes: `Imported via Bulk CSV upload. (Historical acquisition: ${purchaseDate})`
      };

      createdAssets.push(newAst);
    }

    return {
      successCount: createdAssets.length,
      errorCount: errors.length,
      errors,
      createdAssets
    };
  }

  /**
   * Export assets to CSV format
   */
  static exportToCSV(assets: Asset[]): string {
    const headers = ['Asset Code', 'Name', 'Category', 'Model', 'Serial Number', 'Registered Phone Number', 'Registered Device Email', 'Branch', 'Status', 'Condition', 'Purchase Cost', 'Current Value', 'Assigned User'];
    const rows = assets.map(a => [
      `"${a.assetCode}"`,
      `"${a.name}"`,
      `"${a.categoryName}"`,
      `"${a.model}"`,
      `"${a.serialNumber}"`,
      `"${a.phoneNumber || ''}"`,
      `"${a.registeredEmail || ''}"`,
      `"${a.branchName}"`,
      `"${a.status}"`,
      `"${a.condition}"`,
      a.purchaseCost,
      a.currentValue,
      `"${a.assignedToUserName || 'Unassigned'}"`
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}
