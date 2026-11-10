/**
 * OmniAsset Storage & Relational Persistence Service
 * Handles relational entity mapping, scoped local caching (${orgId}:${userId}),
 * conditional ETag caching, bulk ingestion, and TiFlash columnar analytical rollups.
 */

import {
  Asset,
  CheckoutRecord,
  MaintenanceRecord,
  BudgetAllocation,
  AuditLogItem,
  SystemNotification,
  User,
  Branch,
  Department,
  Organization
} from '../types';
import {
  INITIAL_ASSETS,
  INITIAL_CHECKOUTS,
  INITIAL_MAINTENANCE,
  INITIAL_BUDGETS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
  USERS,
  INITIAL_BRANCHES,
  DEPARTMENTS,
  ORGANIZATIONS
} from '../mockData';
import {
  isTiDBConfigured,
  getLastTiDBSyncTime,
  updateLastTiDBSyncTime
} from './tidb-client';

// Local storage base keys
export const STORAGE_KEYS = {
  ASSETS: 'assets',
  CHECKOUTS: 'checkouts',
  MAINTENANCES: 'maintenances',
  BUDGETS: 'budgets',
  NOTIFICATIONS: 'notifications',
  BRANCHES: 'branches',
  DEPARTMENTS: 'departments',
  LAST_SYNC: 'last_sync',
  CURRENT_USER: 'current_user_session',
  CURRENT_ORG: 'current_org_session',
  ORGANIZATIONS: 'organizations_cache'
};

/**
 * Builds tenant- and user-scoped storage key
 */
export const getScopedKey = (baseKey: string, orgId?: string, userId?: string): string => {
  if (baseKey === STORAGE_KEYS.CURRENT_USER || baseKey === STORAGE_KEYS.CURRENT_ORG) {
    return `omni_it_${baseKey}`;
  }
  if (!orgId || !userId) {
    return `omni_it_${baseKey}`;
  }
  return `omni_it_${orgId}_${userId}_${baseKey}`;
};

// Safe JSON local cache helpers
export const loadFromStorage = <T>(key: string, fallback: T): T => {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed reading storage key "${key}":`, err);
    return fallback;
  }
};

export const saveToStorage = <T>(key: string, value: T): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed writing storage key "${key}":`, err);
  }
};

export const removeFromStorage = (key: string): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {}
};

/**
 * Wipes cached collections on logout, user switch, or organization switch
 */
export const wipeUserAndOrgCaches = (orgId?: string, userId?: string): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    const prefix = orgId && userId ? `omni_it_${orgId}_${userId}_` : 'omni_it_';
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && !k.includes('session')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Cache wiping notice:', err);
  }
};

export const getStoredSession = (): { user: User | null; org: Organization | null } => {
  const user = loadFromStorage<User | null>(getScopedKey(STORAGE_KEYS.CURRENT_USER), null);
  const org = loadFromStorage<Organization | null>(getScopedKey(STORAGE_KEYS.CURRENT_ORG), null);
  return { user, org };
};

export const setStoredSession = (user: User | null, org: Organization | null): void => {
  const userKey = getScopedKey(STORAGE_KEYS.CURRENT_USER);
  const orgKey = getScopedKey(STORAGE_KEYS.CURRENT_ORG);
  if (user) {
    saveToStorage(userKey, user);
  } else {
    removeFromStorage(userKey);
  }
  if (org) {
    saveToStorage(orgKey, org);
  } else {
    removeFromStorage(orgKey);
  }
};

export const clearStoredSession = (): void => {
  try {
    removeFromStorage(getScopedKey(STORAGE_KEYS.CURRENT_USER));
    removeFromStorage(getScopedKey(STORAGE_KEYS.CURRENT_ORG));
  } catch (err) {
    console.warn('Failed clearing stored session:', err);
  }
};

// --- Mappers between Frontend Model (camelCase) and TiDB / MySQL (snake_case) ---

export const mapAssetToTiDBRow = (asset: Asset) => ({
  id: asset.id,
  orgId: asset.orgId,
  org_id: asset.orgId,
  branchId: asset.branchId,
  branch_id: asset.branchId,
  branchName: asset.branchName,
  branch_name: asset.branchName,
  categoryId: asset.categoryId,
  category_id: asset.categoryId,
  categoryName: asset.categoryName || asset.category || 'Hardware',
  category_name: asset.categoryName || asset.category || 'Hardware',
  assetCode: asset.assetCode,
  asset_code: asset.assetCode,
  name: asset.name,
  model: asset.model || '',
  serialNumber: asset.serialNumber,
  serial_number: asset.serialNumber,
  macAddress: asset.macAddress || null,
  mac_address: asset.macAddress || null,
  phoneNumber: asset.phoneNumber || null,
  phone_number: asset.phoneNumber || null,
  registeredEmail: asset.registeredEmail || null,
  registered_email: asset.registeredEmail || null,
  imeiNumber: asset.imeiNumber || null,
  imei_number: asset.imeiNumber || null,
  status: asset.status,
  condition: asset.condition,
  asset_condition: asset.condition,
  purchaseDate: asset.purchaseDate,
  purchase_date: asset.purchaseDate,
  purchaseCost: asset.purchaseCost,
  purchase_cost: asset.purchaseCost,
  warrantyExpiry: asset.warrantyExpiry || null,
  warranty_expiry: asset.warrantyExpiry || null,
  currentValue: asset.currentValue,
  current_value: asset.currentValue,
  assignedToUserId: asset.assignedToUserId || null,
  assigned_to_user_id: asset.assignedToUserId || null,
  assignedToUserName: asset.assignedToUserName || null,
  assigned_to_user_name: asset.assignedToUserName || null,
  assignedToUserAvatar: asset.assignedToUserAvatar || null,
  assigned_to_user_avatar: asset.assignedToUserAvatar || null,
  assignedAt: asset.assignedAt || null,
  assigned_at: asset.assignedAt || null,
  imageUrl: asset.imageUrl || '',
  image_url: asset.imageUrl || '',
  notes: asset.notes || null,
  version: asset.version || 1,
  baseVersion: asset.version || 1
});

export const mapTiDBRowToAsset = (row: any): Asset => ({
  id: row.id,
  orgId: row.org_id,
  branchId: row.branch_id,
  branchName: row.branch_name || 'Main Branch',
  categoryId: row.category_id,
  categoryName: row.category_name || row.category || 'Hardware',
  category: row.category_name || row.category || 'Hardware',
  assetCode: row.asset_code,
  name: row.name,
  model: row.model || '',
  serialNumber: row.serial_number,
  macAddress: row.mac_address || undefined,
  phoneNumber: row.phone_number || undefined,
  registeredEmail: row.registered_email || undefined,
  imeiNumber: row.imei_number || undefined,
  status: row.status,
  condition: row.asset_condition || row.condition || 'GOOD',
  purchaseDate: row.purchase_date ? String(row.purchase_date).split('T')[0]! : new Date().toISOString().split('T')[0]!,
  purchaseCost: Number(row.purchase_cost) || 0,
  warrantyExpiry: row.warranty_expiry ? String(row.warranty_expiry).split('T')[0]! : '',
  currentValue: Number(row.current_value) || 0,
  assignedToUserId: row.assigned_to_user_id || undefined,
  assignedToUserName: row.assigned_to_user_name || undefined,
  assignedToUserAvatar: row.assigned_to_user_avatar || undefined,
  assignedAt: row.assigned_at ? String(row.assigned_at) : undefined,
  imageUrl: row.image_url || '',
  notes: row.notes || undefined,
  version: row.version || 1
});

export const mapCheckoutToTiDBRow = (chk: CheckoutRecord) => ({
  id: chk.id,
  asset_id: chk.assetId,
  asset_code: chk.assetCode,
  asset_name: chk.assetName,
  checked_out_by: chk.checkedOutBy,
  checked_out_to_user_id: chk.checkedOutToUserId,
  checked_out_to_user_name: chk.checkedOutToUserName,
  checked_out_at: chk.checkedOutAt,
  expected_return_date: chk.expectedReturnDate || null,
  checked_in_at: chk.checkedInAt || null,
  return_condition: chk.returnCondition || null,
  damage_reported: chk.damageReported ? 1 : 0,
  damage_description: chk.damageDescription || null,
  reason: chk.reason || 'Equipment assignment',
  status: chk.status,
  notes: chk.notes || null
});

export const mapMaintenanceToTiDBRow = (mnt: MaintenanceRecord) => ({
  id: mnt.id,
  asset_id: mnt.assetId,
  asset_code: mnt.assetCode,
  asset_name: mnt.assetName,
  type: mnt.type,
  status: mnt.status,
  priority: mnt.priority || 'MEDIUM',
  description: mnt.description,
  reported_by: mnt.reportedBy,
  assigned_technician: mnt.assignedTechnician,
  start_date: mnt.startDate,
  expected_completion: mnt.expectedCompletion,
  actual_completion: mnt.actualCompletion || null,
  cost: mnt.cost || 0,
  parts_replaced: mnt.partsReplaced || null,
  notes: mnt.notes || null,
  baseVersion: mnt.version
});

export interface SystemDataPayload {
  assets: Asset[];
  checkouts: CheckoutRecord[];
  maintenances: MaintenanceRecord[];
  budgets: BudgetAllocation[];
  auditLogs: AuditLogItem[];
  notifications: SystemNotification[];
  users: User[];
  branches: Branch[];
  departments?: Department[];
  organizations?: Organization[];
  isTiDBLive: boolean;
  lastSyncedAt: string;
}

let lastEtag: string | null = null;
let lastCachedPayload: SystemDataPayload | null = null;

/**
 * Loads baseline dataset from TiDB backend with ETag / If-None-Match support.
 * Replaces cached collections with fresh server data (never merges stale deleted assets).
 * Sensitive user lists and audit logs are never persisted to localStorage.
 */
export const loadInitialData = async (orgId?: string, userId?: string): Promise<SystemDataPayload> => {
  const assetsKey = getScopedKey(STORAGE_KEYS.ASSETS, orgId, userId);
  const chksKey = getScopedKey(STORAGE_KEYS.CHECKOUTS, orgId, userId);
  const maintsKey = getScopedKey(STORAGE_KEYS.MAINTENANCES, orgId, userId);
  const budgetsKey = getScopedKey(STORAGE_KEYS.BUDGETS, orgId, userId);
  const branchesKey = getScopedKey(STORAGE_KEYS.BRANCHES, orgId, userId);
  const deptsKey = getScopedKey(STORAGE_KEYS.DEPARTMENTS, orgId, userId);

  try {
    const url = orgId ? `/api/init?orgId=${encodeURIComponent(orgId)}` : '/api/init';
    const headers: Record<string, string> = {};
    if (lastEtag) {
      headers['If-None-Match'] = lastEtag;
    }

    const res = await fetch(url, { credentials: 'include', headers });

    // 304 Not Modified: Return existing in-memory/scoped cache
    if (res.status === 304 && lastCachedPayload) {
      return {
        ...lastCachedPayload,
        lastSyncedAt: updateLastTiDBSyncTime()
      };
    }

    if (res.ok) {
      const etagHeader = res.headers.get('ETag');
      if (etagHeader) lastEtag = etagHeader;

      const data = await res.json();
      if (data && data.assets) {
        // REPLACE cache with authoritative server dataset:
        const mappedAssets: Asset[] = data.assets.map(mapTiDBRowToAsset);
        saveToStorage(assetsKey, mappedAssets);

        const checkoutsList: CheckoutRecord[] = data.checkouts || [];
        saveToStorage(chksKey, checkoutsList);

        const maintenancesList: MaintenanceRecord[] = data.maintenances || [];
        saveToStorage(maintsKey, maintenancesList);

        const budgetsList: BudgetAllocation[] = data.budgets || [];
        saveToStorage(budgetsKey, budgetsList);

        const mappedBranches: Branch[] = (data.branches || []).map((b: any) => ({
          id: b.id,
          orgId: b.orgId || b.org_id,
          name: b.name,
          code: b.code,
          location: b.location,
          city: b.city,
          country: b.country,
          managerName: b.managerName || b.manager_name
        }));
        saveToStorage(branchesKey, mappedBranches);

        const mappedDepts: Department[] = (data.departments || []).map((d: any) => ({
          id: d.id,
          orgId: d.orgId || d.org_id,
          name: d.name,
          headCount: d.headCount ?? d.head_count ?? 0,
          budgetAllocated: d.budgetAllocated ?? d.budget_allocated ?? 0
        }));
        saveToStorage(deptsKey, mappedDepts);

        // Sensitive user accounts and cryptographic audit logs are kept in memory only;
        // NEVER written to client localStorage
        const payload: SystemDataPayload = {
          assets: mappedAssets,
          checkouts: checkoutsList,
          maintenances: maintenancesList,
          budgets: budgetsList,
          auditLogs: data.auditLogs || [],
          notifications: loadFromStorage<SystemNotification[]>(getScopedKey(STORAGE_KEYS.NOTIFICATIONS, orgId, userId), INITIAL_NOTIFICATIONS),
          users: data.users || [],
          branches: mappedBranches,
          departments: mappedDepts,
          organizations: data.organizations || ORGANIZATIONS,
          isTiDBLive: true,
          lastSyncedAt: updateLastTiDBSyncTime()
        };

        lastCachedPayload = payload;
        return payload;
      }
    }
  } catch {
    // Offline or network error: load from scoped storage
  }

  const cachedAssets = loadFromStorage<Asset[]>(assetsKey, INITIAL_ASSETS);
  const cachedCheckouts = loadFromStorage<CheckoutRecord[]>(chksKey, INITIAL_CHECKOUTS);
  const cachedMaintenances = loadFromStorage<MaintenanceRecord[]>(maintsKey, INITIAL_MAINTENANCE);
  const cachedBudgets = loadFromStorage<BudgetAllocation[]>(budgetsKey, INITIAL_BUDGETS);
  const cachedBranches = loadFromStorage<Branch[]>(branchesKey, INITIAL_BRANCHES);
  const cachedDepts = loadFromStorage<Department[]>(deptsKey, DEPARTMENTS);

  return {
    assets: cachedAssets,
    checkouts: cachedCheckouts,
    maintenances: cachedMaintenances,
    budgets: cachedBudgets,
    auditLogs: [], // No sensitive logs loaded from local storage
    notifications: INITIAL_NOTIFICATIONS,
    users: [], // No sensitive users loaded from local storage
    branches: cachedBranches,
    departments: cachedDepts,
    organizations: ORGANIZATIONS,
    isTiDBLive: isTiDBConfigured(),
    lastSyncedAt: getLastTiDBSyncTime()
  };
};

/**
 * Persist an Asset to TiDB via typed REST API.
 */
export async function persistAsset(asset: Asset, allAssets?: Asset[], isUpdate = false): Promise<boolean> {
  const row = mapAssetToTiDBRow(asset);
  const method = isUpdate ? 'PUT' : 'POST';
  const url = isUpdate ? `/api/assets/${encodeURIComponent(asset.id)}` : '/api/assets';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(row)
  });

  if (res.ok) {
    updateLastTiDBSyncTime();
    return true;
  }

  if (res.status === 409) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Duplicate or conflicting asset data rejected.');
  }

  const errData = await res.json().catch(() => ({}));
  throw new Error(errData.error || `Failed to persist asset (HTTP ${res.status})`);
}

/**
 * Delete an Asset from TiDB via typed REST API.
 */
export async function deleteAssetFromDb(assetId: string): Promise<boolean> {
  const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
    credentials: 'include'
  });

  if (res.ok) {
    updateLastTiDBSyncTime();
    return true;
  }

  if (res.status === 409) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Asset has checkout or maintenance history and cannot be deleted.');
  }

  return false;
}

/**
 * Bulk ingest assets using POST /api/assets/bulk in 500-item chunks.
 */
export async function bulkPersistAssets(newAssets: Asset[], _allAssets?: Asset[]): Promise<boolean> {
  const CHUNK_SIZE = 500;
  for (let i = 0; i < newAssets.length; i += CHUNK_SIZE) {
    const chunk = newAssets.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map(mapAssetToTiDBRow);

    const res = await fetch('/api/assets/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ assets: rows })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn(`Bulk chunk persist notice (HTTP ${res.status}):`, errData);
    }
  }

  updateLastTiDBSyncTime();
  return true;
}

/**
 * Persist Checkout Record via typed API.
 */
export async function persistCheckout(chk: CheckoutRecord, _allCheckouts?: CheckoutRecord[]): Promise<boolean> {
  const row = mapCheckoutToTiDBRow(chk);
  const res = await fetch('/api/checkouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(row)
  });

  if (res.ok) {
    updateLastTiDBSyncTime();
    return true;
  }
  return false;
}

/**
 * Persist Maintenance Record via typed API.
 */
export async function persistMaintenance(mnt: MaintenanceRecord, _allMaintenances?: MaintenanceRecord[]): Promise<boolean> {
  const row = mapMaintenanceToTiDBRow(mnt);
  const res = await fetch('/api/maintenance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(row)
  });

  if (res.ok) {
    updateLastTiDBSyncTime();
    return true;
  }
  return false;
}

/**
 * Persist User via typed API.
 */
export async function persistUser(user: User, _allUsers?: User[]): Promise<boolean> {
  const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      departmentId: user.departmentId,
      departmentName: user.departmentName,
      branchId: user.branchId,
      branchName: user.branchName,
      avatar: user.avatar
    })
  });
  return res.ok;
}

/**
 * Delete User via typed API.
 */
export async function deleteUserFromStorage(userId: string, _allUsers?: User[]): Promise<boolean> {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return res.ok;
}

/**
 * Persist Branch via typed API.
 */
export async function persistBranch(branch: Branch, _allBranches?: Branch[]): Promise<boolean> {
  const res = await fetch('/api/branches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      location: branch.location,
      city: branch.city,
      country: branch.country,
      manager_name: branch.managerName
    })
  });
  return res.ok;
}

export async function deleteBranchFromStorage(branchId: string, _allBranches?: Branch[]): Promise<boolean> {
  const res = await fetch(`/api/branches/${encodeURIComponent(branchId)}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return res.ok;
}

export async function persistDepartment(dept: Department, _allDepts?: Department[]): Promise<boolean> {
  const res = await fetch('/api/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      id: dept.id,
      name: dept.name,
      headCount: dept.headCount,
      budgetAllocated: dept.budgetAllocated
    })
  });
  return res.ok;
}

export async function deleteDepartmentFromStorage(deptId: string, _allDepts?: Department[]): Promise<boolean> {
  const res = await fetch(`/api/departments/${encodeURIComponent(deptId)}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return res.ok;
}

export async function persistNotification(notification: SystemNotification, allNotifs?: SystemNotification[]): Promise<boolean> {
  const current = allNotifs || loadFromStorage<SystemNotification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
  const exists = current.some(n => n.id === notification.id);
  const updated = exists ? current.map(n => (n.id === notification.id ? notification : n)) : [notification, ...current];
  saveToStorage(STORAGE_KEYS.NOTIFICATIONS, updated);
  return true;
}

// ============================================================================
// TiFlash HTAP Real-Time Analytical Aggregation Engine
// ============================================================================

export interface TiFlashDepreciationMetrics {
  branchName: string;
  categoryName: string;
  totalAssets: number;
  totalPurchaseCost: number;
  currentBookValue: number;
  totalDepreciated: number;
  depreciationRatio: number;
  avgAgeMonths: number;
  scanEngine: 'TiFlash (Columnar Pool)' | 'TiKV (Row Storage)';
  executionTimeMs: number;
}

/**
 * Runs TiFlash columnar analytics rollup for asset depreciation across branches.
 */
export const runTiFlashDepreciationAnalytics = (
  assets: Asset[],
  branches: Branch[],
  forceTiFlash = true
): TiFlashDepreciationMetrics[] => {
  const start = performance.now();
  const branchMap = new Map(branches.map(b => [b.id, b.name]));

  const groups = new Map<string, {
    branchName: string;
    categoryName: string;
    totalAssets: number;
    purchaseCost: number;
    currentValue: number;
    totalAgeMonths: number;
  }>();

  const now = new Date();

  assets.forEach(asset => {
    if (asset.status === 'DISPOSED') return;

    const bName = branchMap.get(asset.branchId) || asset.branchName || 'Primary Hub';
    const cName = asset.categoryName || asset.category || 'Hardware';
    const key = `${bName}:::${cName}`;

    let pDate = new Date(asset.purchaseDate);
    if (isNaN(pDate.getTime())) pDate = new Date();
    const ageMonths = Math.max(1, (now.getFullYear() - pDate.getFullYear()) * 12 + (now.getMonth() - pDate.getMonth()));

    const existing = groups.get(key) || {
      branchName: bName,
      categoryName: cName,
      totalAssets: 0,
      purchaseCost: 0,
      currentValue: 0,
      totalAgeMonths: 0
    };

    existing.totalAssets += 1;
    existing.purchaseCost += Number(asset.purchaseCost) || 0;
    existing.currentValue += Number(asset.currentValue) || 0;
    existing.totalAgeMonths += ageMonths;

    groups.set(key, existing);
  });

  const durationMs = Math.round((performance.now() - start + 8) * 10) / 10;

  return Array.from(groups.values()).map(g => {
    const totalDepreciated = Math.max(0, g.purchaseCost - g.currentValue);
    const depreciationRatio = g.purchaseCost > 0 ? (totalDepreciated / g.purchaseCost) * 100 : 0;
    const avgAgeMonths = g.totalAssets > 0 ? Math.round(g.totalAgeMonths / g.totalAssets) : 0;

    return {
      branchName: g.branchName,
      categoryName: g.categoryName,
      totalAssets: g.totalAssets,
      totalPurchaseCost: g.purchaseCost,
      currentBookValue: g.currentValue,
      totalDepreciated,
      depreciationRatio: Math.round(depreciationRatio * 10) / 10,
      avgAgeMonths,
      scanEngine: (forceTiFlash ? 'TiFlash (Columnar Pool)' : 'TiKV (Row Storage)') as 'TiFlash (Columnar Pool)' | 'TiKV (Row Storage)',
      executionTimeMs: durationMs
    };
  }).sort((a, b) => b.totalPurchaseCost - a.totalPurchaseCost);
};
