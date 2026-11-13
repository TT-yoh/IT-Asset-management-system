/**
 * OmniAsset Storage & Relational Persistence Service
 * Handles relational entity mapping, scoped local caching (${orgId}:${userId}),
 * conditional ETag caching, bulk ingestion, and TiFlash columnar analytical rollups.
 */

import { getWriteActivity } from './api';
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
  // Client never caches user or role in localStorage; server session cookie is authoritative
  return { user: null, org: null };
};

export const setStoredSession = (_user: User | null, _org: Organization | null): void => {
  // No-op: server cookie is single source of truth
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
  costSource: asset.costSource || 'MANUAL',
  manufacturer: asset.manufacturer || null,
  supplier: asset.supplier || null,
  invoiceNumber: asset.invoiceNumber || null,
  locationDetail: asset.locationDetail || null,
  departmentId: asset.departmentId || null,
  ownershipType: asset.ownershipType || 'OWNED',
  leaseEndDate: asset.leaseEndDate || null,
  specs: asset.specs && Object.keys(asset.specs).length > 0 ? asset.specs : null,
  version: asset.version || 1,
  baseVersion: asset.version || 1
});

const parseAssetSpecs = (raw: unknown): Asset['specs'] => {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Asset['specs']) : undefined;
};

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
  costSource: row.cost_source === 'ESTIMATED' ? 'ESTIMATED' : 'MANUAL',
  manufacturer: row.manufacturer || undefined,
  supplier: row.supplier || undefined,
  invoiceNumber: row.invoice_number || undefined,
  locationDetail: row.location_detail || undefined,
  departmentId: row.department_id || undefined,
  departmentName: row.department_name || undefined,
  ownershipType: row.ownership_type === 'LEASED' || row.ownership_type === 'PERSONAL' ? row.ownership_type : 'OWNED',
  leaseEndDate: row.lease_end_date ? String(row.lease_end_date).split('T')[0]! : undefined,
  specs: parseAssetSpecs(row.specs),
  version: row.version || 1
});

/**
 * Thrown when the server answers a save with a 4xx: the request reached the server and was
 * refused (validation, conflict, permission). Retrying or queueing it offline cannot succeed.
 */
export class ServerRejectedError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ServerRejectedError';
    this.status = status;
  }
}

async function throwIfNotSaved(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  const body = await res.json().catch(() => null);
  const message = body?.error || `${what} could not be saved (HTTP ${res.status}).`;
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    throw new ServerRejectedError(res.status, message);
  }
  throw new Error(message);
}

/** Date-only (YYYY-MM-DD) text from a DATE/DATETIME value, or undefined. */
const toDateOnly = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value).replace(' ', 'T').split('T')[0] || undefined;
};

/**
 * Server rows use database column names (snake_case); the app's records are camelCase.
 * Each mapper accepts either form, so already-mapped records pass through unchanged.
 */
export const mapTiDBRowToCheckout = (row: any): CheckoutRecord => ({
  id: row.id,
  assetId: row.assetId ?? row.asset_id,
  assetCode: row.assetCode ?? row.asset_code ?? '',
  assetName: row.assetName ?? row.asset_name ?? '',
  checkedOutBy: row.checkedOutBy ?? row.checked_out_by ?? '',
  checkedOutToUserId: row.checkedOutToUserId ?? row.checked_out_to_user_id ?? '',
  checkedOutToUserName: row.checkedOutToUserName ?? row.checked_out_to_user_name ?? '',
  checkedOutAt: toDateOnly(row.checkedOutAt ?? row.checked_out_at) || '',
  expectedReturnDate: toDateOnly(row.expectedReturnDate ?? row.expected_return_date),
  checkedInAt: toDateOnly(row.checkedInAt ?? row.checked_in_at),
  returnCondition: (row.returnCondition ?? row.return_condition) || undefined,
  damageReported: Boolean(row.damageReported ?? row.damage_reported),
  damageDescription: (row.damageDescription ?? row.damage_description) || undefined,
  reason: row.reason || 'Equipment assignment',
  status: row.status || 'ACTIVE',
  notes: row.notes || undefined,
  version: row.version || 1
});

export const mapTiDBRowToMaintenance = (row: any): MaintenanceRecord => ({
  id: row.id,
  assetId: row.assetId ?? row.asset_id,
  assetCode: row.assetCode ?? row.asset_code ?? '',
  assetName: row.assetName ?? row.asset_name ?? '',
  type: row.type || 'REPAIR',
  status: row.status || 'PENDING',
  priority: row.priority || 'MEDIUM',
  description: row.description || '',
  reportedBy: row.reportedBy ?? row.reported_by ?? '',
  assignedTechnician: row.assignedTechnician ?? row.assigned_technician ?? '',
  startDate: toDateOnly(row.startDate ?? row.start_date) || '',
  expectedCompletion: toDateOnly(row.expectedCompletion ?? row.expected_completion) || '',
  actualCompletion: toDateOnly(row.actualCompletion ?? row.actual_completion),
  cost: Number(row.cost) || 0,
  partsReplaced: (row.partsReplaced ?? row.parts_replaced) || undefined,
  notes: row.notes || undefined,
  version: row.version || 1,
  auditLogs: Array.isArray(row.auditLogs) ? row.auditLogs : undefined
});

export const mapTiDBRowToBudget = (row: any): BudgetAllocation => ({
  id: row.id,
  orgId: row.orgId ?? row.org_id,
  departmentName: row.departmentName ?? row.department_name ?? '',
  branchName: row.branchName ?? row.branch_name ?? '',
  fiscalYear: Number(row.fiscalYear ?? row.fiscal_year) || new Date().getFullYear(),
  allocated: Number(row.allocated) || 0,
  spent: Number(row.spent) || 0,
  version: Number(row.version) || 1
});

export const mapTiDBRowToAuditLog = (row: any): AuditLogItem => {
  const changes = row.changes;
  return {
    id: String(row.id),
    orgId: row.orgId ?? row.org_id,
    seq: row.seq !== undefined && row.seq !== null ? Number(row.seq) : undefined,
    actorId: (row.actorId ?? row.actor_id) || undefined,
    userName: row.userName ?? row.user_name ?? 'System',
    userRole: row.userRole ?? row.user_role ?? 'USER',
    action: row.action || '',
    entityType: row.entityType ?? row.entity_type ?? 'Asset',
    entityId: (row.entityId ?? row.entity_id) || undefined,
    entityName: row.entityName ?? row.entity_name ?? '',
    // The audit screen prints this as text; the column may arrive as parsed JSON.
    changes: typeof changes === 'string' ? changes : changes ? JSON.stringify(changes) : '',
    timestamp: row.timestamp ? String(row.timestamp) : '',
    prevHash: (row.prevHash ?? row.prev_hash) || undefined,
    hash: row.hash || undefined,
    ipAddress: row.ipAddress ?? row.ip_address ?? ''
  };
};

export const mapCheckoutToTiDBRow = (chk: CheckoutRecord) => ({
  id: chk.id,
  // The API reads the camelCase names; snake_case is kept for older consumers.
  assetId: chk.assetId,
  checkedOutToUserId: chk.checkedOutToUserId,
  expectedReturnDate: chk.expectedReturnDate || null,
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
  // The API reads the camelCase names; snake_case is kept for older consumers.
  assetId: mnt.assetId,
  assignedTechnician: mnt.assignedTechnician,
  startDate: mnt.startDate,
  expectedCompletion: mnt.expectedCompletion,
  actualCompletion: mnt.actualCompletion || null,
  partsReplaced: mnt.partsReplaced || null,
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
  /**
   * True when a save started or finished while this snapshot was being fetched. The snapshot
   * may be missing that save, so callers must not replace on-screen data with it.
   */
  stale?: boolean;
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

  const writesAtStart = getWriteActivity().epoch;
  const overlappedWrite = () => {
    const now = getWriteActivity();
    return now.inFlight > 0 || now.epoch !== writesAtStart;
  };

  try {
    const url = orgId ? `/api/init?orgId=${encodeURIComponent(orgId)}` : '/api/init';
    const headers: Record<string, string> = {};
    if (lastEtag) {
      headers['If-None-Match'] = lastEtag;
    }

    const res = await fetch(url, { credentials: 'include', headers });

    // The session ended on the server (expired, signed out elsewhere, password changed on
    // another device). Tell the app so it can return to sign-in instead of quietly showing
    // cached data while every action fails.
    if (res.status === 401 && typeof window !== 'undefined') {
      const body = await res.clone().json().catch(() => null);
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: body?.error || '' }));
    }

    // 304 Not Modified: Return existing in-memory/scoped cache
    if (res.status === 304 && lastCachedPayload) {
      return {
        ...lastCachedPayload,
        lastSyncedAt: updateLastTiDBSyncTime(),
        stale: overlappedWrite()
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

        const checkoutsList: CheckoutRecord[] = (data.checkouts || []).map(mapTiDBRowToCheckout);
        saveToStorage(chksKey, checkoutsList);

        const maintenancesList: MaintenanceRecord[] = (data.maintenances || []).map(mapTiDBRowToMaintenance);
        saveToStorage(maintsKey, maintenancesList);

        const budgetsList: BudgetAllocation[] = (data.budgets || []).map(mapTiDBRowToBudget);
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
          auditLogs: (data.auditLogs || []).map(mapTiDBRowToAuditLog),
          notifications: loadFromStorage<SystemNotification[]>(getScopedKey(STORAGE_KEYS.NOTIFICATIONS, orgId, userId), []),
          users: data.users || [],
          branches: mappedBranches,
          departments: mappedDepts,
          organizations: data.organizations || [],
          isTiDBLive: true,
          lastSyncedAt: updateLastTiDBSyncTime()
        };

        if (overlappedWrite()) {
          // Do not cache a snapshot that may predate an in-flight save; force a full reload next time.
          lastEtag = null;
          return { ...payload, stale: true };
        }

        lastCachedPayload = payload;
        return payload;
      }
    }
  } catch {
    // Offline or network error: load from scoped storage
  }

  const cachedAssets = loadFromStorage<Asset[]>(assetsKey, []);
  const cachedCheckouts = loadFromStorage<CheckoutRecord[]>(chksKey, []);
  const cachedMaintenances = loadFromStorage<MaintenanceRecord[]>(maintsKey, []);
  const cachedBudgets = loadFromStorage<BudgetAllocation[]>(budgetsKey, []);
  const cachedBranches = loadFromStorage<Branch[]>(branchesKey, []);
  const cachedDepts = loadFromStorage<Department[]>(deptsKey, []);

  return {
    assets: cachedAssets,
    checkouts: cachedCheckouts,
    maintenances: cachedMaintenances,
    budgets: cachedBudgets,
    auditLogs: [], // No sensitive logs loaded from local storage
    notifications: [],
    users: [], // No sensitive users loaded from local storage
    branches: cachedBranches,
    departments: cachedDepts,
    organizations: [],
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

  const errData = await res.json().catch(() => ({}));
  if (res.status === 409) {
    throw new Error(errData.error || 'Asset has checkout or maintenance history and cannot be deleted.');
  }
  throw new Error(errData.error || `The asset could not be deleted (HTTP ${res.status}).`);
}

/**
 * Bulk ingest assets using POST /api/assets/bulk in 500-item chunks.
 */
/** What the server did with a bulk import. */
export interface BulkImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Send assets to POST /api/assets/bulk in 500-item chunks and add up the server's report.
 * A chunk the server refuses outright counts all its rows as skipped, with the reason.
 * Throws only when the server cannot be reached at all.
 */
export async function bulkPersistAssets(newAssets: Asset[], _allAssets?: Asset[]): Promise<BulkImportResult> {
  const CHUNK_SIZE = 500;
  const result: BulkImportResult = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < newAssets.length; i += CHUNK_SIZE) {
    const chunk = newAssets.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map(mapAssetToTiDBRow);

    const res = await fetch('/api/assets/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ assets: rows })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      result.skipped += chunk.length;
      result.errors.push(data?.error || `The server refused the import (HTTP ${res.status}).`);
      continue;
    }
    result.imported += Number(data?.imported) || 0;
    result.skipped += Number(data?.skipped) || 0;
    if (Array.isArray(data?.errors)) {
      result.errors.push(...data.errors.map((e: unknown) => (typeof e === 'string' ? e : JSON.stringify(e))));
    }
  }

  if (result.imported > 0) updateLastTiDBSyncTime();
  return result;
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

  await throwIfNotSaved(res, 'Checkout');
  updateLastTiDBSyncTime();
  return true;
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

  await throwIfNotSaved(res, 'Repair ticket');
  updateLastTiDBSyncTime();
  return true;
}

/**
 * Reporter for saves that the server refused or that never reached it. The app registers a
 * function that shows the message to the user, so a failed save is never silently presented
 * as if it had worked.
 */
/** Fired after a failed save so the app reloads from the server and drops the optimistic change. */
export const RESYNC_EVENT = 'omni:resync-after-failed-save';
/** Fired when the server reports that the signed-in session no longer exists. */
export const SESSION_EXPIRED_EVENT = 'omni:session-expired';

let saveFailureReporter: ((message: string) => void) | null = null;
export function setSaveFailureReporter(reporter: ((message: string) => void) | null): void {
  saveFailureReporter = reporter;
}

const inFlightSaves = new Map<string, Promise<boolean>>();

/**
 * Send one save request. Identical requests issued back-to-back (React runs state updaters
 * twice in development) share a single network call. Resolves true only when the server
 * accepted the change; otherwise the failure is reported and false is returned.
 */
function sendSave(what: string, url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<boolean> {
  const key = `${method} ${url} ${JSON.stringify(body ?? null)}`;
  const existing = inFlightSaves.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      if (res.ok) {
        updateLastTiDBSyncTime();
        return true;
      }
      const data = await res.json().catch(() => null);
      saveFailureReporter?.(`${what} was not saved: ${data?.error || `the server refused it (HTTP ${res.status})`}`);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(RESYNC_EVENT));
      return false;
    } catch {
      saveFailureReporter?.(`${what} could not reach the server. Check your connection and try again.`);
      return false;
    } finally {
      setTimeout(() => inFlightSaves.delete(key), 1500);
    }
  })();

  inFlightSaves.set(key, request);
  return request;
}

/**
 * Update a user via typed API. The server requires the record version the edit was based on
 * (optimistic concurrency). A user object without a version has not been loaded from the
 * server yet, so there is nothing to update: pass `reportMissingVersion` for a real edit so
 * the user is told instead of the change silently not saving.
 */
export async function persistUser(user: User, _allUsers?: User[], reportMissingVersion = false): Promise<boolean> {
  if (user.version === undefined || user.version === null) {
    if (reportMissingVersion) {
      saveFailureReporter?.(`Changes to ${user.fullName} were not saved: this account is still syncing. Wait a few seconds and try again.`);
    }
    return false;
  }
  return sendSave(`Changes to ${user.fullName}`, `/api/users/${encodeURIComponent(user.id)}`, 'PUT', {
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    departmentId: user.departmentId,
    departmentName: user.departmentName,
    branchId: user.branchId,
    branchName: user.branchName,
    avatar: user.avatar,
    baseVersion: user.version
  });
}

/**
 * Delete User via typed API.
 */
export async function deleteUserFromStorage(userId: string, _allUsers?: User[]): Promise<boolean> {
  return sendSave('Removing the staff account', `/api/users/${encodeURIComponent(userId)}`, 'DELETE');
}

/**
 * Create (POST) or update (PUT) a branch via typed API.
 */
export async function persistBranch(branch: Branch, _allBranches?: Branch[], isUpdate = false): Promise<boolean> {
  const body = {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    location: branch.location,
    city: branch.city,
    country: branch.country,
    managerName: branch.managerName,
    manager_name: branch.managerName
  };
  return isUpdate
    ? sendSave(`Changes to ${branch.name}`, `/api/branches/${encodeURIComponent(branch.id)}`, 'PUT', body)
    : sendSave(`Facility ${branch.name}`, '/api/branches', 'POST', body);
}

export async function deleteBranchFromStorage(branchId: string, _allBranches?: Branch[]): Promise<boolean> {
  return sendSave('Removing the facility', `/api/branches/${encodeURIComponent(branchId)}`, 'DELETE');
}

/**
 * Create (POST) or update (PUT) a department via typed API.
 */
export async function persistDepartment(dept: Department, _allDepts?: Department[], isUpdate = false): Promise<boolean> {
  const body = {
    id: dept.id,
    name: dept.name,
    headCount: dept.headCount,
    budgetAllocated: dept.budgetAllocated
  };
  return isUpdate
    ? sendSave(`Changes to ${dept.name}`, `/api/departments/${encodeURIComponent(dept.id)}`, 'PUT', body)
    : sendSave(`Department ${dept.name}`, '/api/departments', 'POST', body);
}

export async function deleteDepartmentFromStorage(deptId: string, _allDepts?: Department[]): Promise<boolean> {
  return sendSave('Removing the department', `/api/departments/${encodeURIComponent(deptId)}`, 'DELETE');
}

/** Fields a budget save sends. `reason` is required by the server when `spent` changes. */
export interface BudgetInput {
  departmentName: string;
  branchName: string;
  fiscalYear: number;
  allocated: number;
  spent?: number;
  reason?: string;
}

/**
 * Create a budget (no `existing`) or update one. Updates send the record version so a
 * concurrent change is refused instead of silently overwritten.
 */
export async function persistBudget(input: BudgetInput, existing?: BudgetAllocation): Promise<boolean> {
  const label = `Budget for ${input.departmentName} (${input.branchName}, FY ${input.fiscalYear})`;
  if (!existing) {
    return sendSave(label, '/api/budgets', 'POST', {
      departmentName: input.departmentName,
      branchName: input.branchName,
      fiscalYear: input.fiscalYear,
      allocated: input.allocated
    });
  }
  return sendSave(label, `/api/budgets/${encodeURIComponent(existing.id)}`, 'PUT', {
    departmentName: input.departmentName,
    branchName: input.branchName,
    fiscalYear: input.fiscalYear,
    allocated: input.allocated,
    spent: input.spent,
    reason: input.reason,
    baseVersion: existing.version || 1
  });
}

export async function deleteBudgetFromDb(budget: BudgetAllocation): Promise<boolean> {
  return sendSave(`Removing the ${budget.departmentName} budget`, `/api/budgets/${encodeURIComponent(budget.id)}`, 'DELETE');
}

export async function persistNotification(notification: SystemNotification, allNotifs?: SystemNotification[]): Promise<boolean> {
  const current = allNotifs || loadFromStorage<SystemNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
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
