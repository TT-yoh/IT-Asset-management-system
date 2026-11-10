import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { Asset, CheckoutRecord, MaintenanceRecord, BudgetAllocation, AuditLogItem, AssetStatus } from '../types';
import {
  INITIAL_ASSETS,
  INITIAL_CHECKOUTS,
  INITIAL_MAINTENANCE,
  INITIAL_BUDGETS,
  INITIAL_AUDIT_LOGS
} from '../mockData';
import {
  STORAGE_KEYS,
  getScopedKey,
  loadInitialData,
  loadFromStorage,
  persistAsset,
  deleteAssetFromDb,
  bulkPersistAssets,
  persistCheckout,
  persistMaintenance,
  mapAssetToTiDBRow,
  mapCheckoutToTiDBRow,
  mapMaintenanceToTiDBRow
} from '../lib/tidb-storage';
import {
  isTiDBConfigured,
  getLastTiDBSyncTime
} from '../lib/tidb-client';
import { queueOfflineMutation, registerReplayExecutor } from '../lib/offline-sync';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';

interface AssetContextType {
  assets: Asset[];
  checkouts: CheckoutRecord[];
  maintenances: MaintenanceRecord[];
  budgets: BudgetAllocation[];
  auditLogs: AuditLogItem[];
  filteredAssets: Asset[];
  filteredCheckouts: CheckoutRecord[];
  filteredMaintenances: MaintenanceRecord[];
  filteredBudgets: BudgetAllocation[];
  filteredAuditLogs: AuditLogItem[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isTiDBLive: boolean;
  lastSyncedAt: string;
  tiDBSyncTime: string;
  showTiDBModal: boolean;
  setShowTiDBModal: (show: boolean) => void;
  refreshAppData: () => Promise<void>;
  handleAddAsset: (newAst: Asset) => Promise<void>;
  handleUpdateAsset: (updatedAst: Asset) => Promise<void>;
  handleDeleteAsset: (astId: string) => Promise<void>;
  handleBulkAddAssets: (newAssets: Asset[]) => Promise<void>;
  handleBatchUpdateStatus: (assetIds: string[], newStatus: AssetStatus) => Promise<void>;
  handleBatchTransferBranch: (assetIds: string[], targetBranchId: string, targetBranchName: string) => Promise<void>;
  handleBatchDeleteAssets: (assetIds: string[]) => Promise<void>;
  handleNewCheckout: (chk: CheckoutRecord, updatedAsset?: Asset) => Promise<void>;
  handleReturnAsset: (chkId: string, returnCondition: string, notes?: string) => Promise<void>;
  handleReportIssue: (mnt: MaintenanceRecord) => Promise<void>;
  handleCompleteRepair: (mntId: string) => Promise<void>;
  handleUpdateTicket: (updatedRecord: MaintenanceRecord) => Promise<void>;
  handleLoadDemoData: () => void;
  handleResetCleanSlate: () => void;
}

const AssetContext = createContext<AssetContextType | undefined>(undefined);

export const AssetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentOrg, currentUser, isBranchRestricted, handleSyncUsers, handleSyncBranches, handleSyncOrganizations } = useAuth();
  const { addNotification, setNotifications, evaluateAutomatedAlerts } = useNotifications();

  const scopedAssetsKey = useMemo(() => getScopedKey(STORAGE_KEYS.ASSETS, currentOrg?.id, currentUser?.id), [currentOrg?.id, currentUser?.id]);
  const scopedChksKey = useMemo(() => getScopedKey(STORAGE_KEYS.CHECKOUTS, currentOrg?.id, currentUser?.id), [currentOrg?.id, currentUser?.id]);
  const scopedMaintsKey = useMemo(() => getScopedKey(STORAGE_KEYS.MAINTENANCES, currentOrg?.id, currentUser?.id), [currentOrg?.id, currentUser?.id]);
  const scopedBudgetsKey = useMemo(() => getScopedKey(STORAGE_KEYS.BUDGETS, currentOrg?.id, currentUser?.id), [currentOrg?.id, currentUser?.id]);

  // Synchronously initialize from tenant/user scoped local cache
  const [assets, setAssets] = useState<Asset[]>(() => loadFromStorage<Asset[]>(scopedAssetsKey, INITIAL_ASSETS));
  const [checkouts, setCheckouts] = useState<CheckoutRecord[]>(() => loadFromStorage<CheckoutRecord[]>(scopedChksKey, INITIAL_CHECKOUTS));
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>(() => loadFromStorage<MaintenanceRecord[]>(scopedMaintsKey, INITIAL_MAINTENANCE));
  const [budgets, setBudgets] = useState<BudgetAllocation[]>(() => loadFromStorage<BudgetAllocation[]>(scopedBudgetsKey, INITIAL_BUDGETS));
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [lastSyncedAt, setLastSyncedAt] = useState<string>('TiDB Primary (HTAP)');
  const [isTiDBLive, setIsTiDBLive] = useState<boolean>(isTiDBConfigured());
  const [showTiDBModal, setShowTiDBModal] = useState<boolean>(false);
  const [tiDBSyncTime, setTiDBSyncTime] = useState<string>(getLastTiDBSyncTime());

  const refreshAppData = async () => {
    try {
      const data = await loadInitialData(currentOrg?.id, currentUser?.id);
      setAssets(data.assets);
      setCheckouts(data.checkouts);
      setMaintenances(data.maintenances);
      setBudgets(data.budgets);
      setAuditLogs(data.auditLogs);
      setNotifications(data.notifications);
      handleSyncUsers(data.users);
      handleSyncBranches(data.branches);
      if (data.organizations && handleSyncOrganizations) {
        handleSyncOrganizations(data.organizations);
      }
      setLastSyncedAt(data.lastSyncedAt);
    } catch (err) {
      console.warn('Initial data load notice:', err);
    }
  };

  useEffect(() => {
    refreshAppData();

    // Register replay executor with exact HTTP status propagation (401, 403, 409, 5xx)
    const unregisterExecutor = registerReplayExecutor(async (mut) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Idempotency-Key': mut.idempotencyKey || `idemp-mut-${mut.id}`,
        'X-Client-Id': mut.clientId || 'client-unknown',
        'X-Client-Seq': String(mut.clientSeq || 1)
      };

      try {
        if (mut.table === 'assets') {
          if (mut.action === 'DELETE') {
            const res = await fetch(`/api/assets/${encodeURIComponent(mut.data.id)}`, {
              method: 'DELETE',
              headers,
              credentials: 'include'
            });
            return { ok: res.ok, status: res.status };
          } else if (mut.action === 'UPDATE') {
            const row = mapAssetToTiDBRow(mut.data);
            const res = await fetch(`/api/assets/${encodeURIComponent(mut.data.id)}`, {
              method: 'PUT',
              headers,
              credentials: 'include',
              body: JSON.stringify({ ...row, baseVersion: mut.baseVersion })
            });
            return { ok: res.ok, status: res.status };
          } else {
            const row = mapAssetToTiDBRow(mut.data);
            const res = await fetch('/api/assets', {
              method: 'POST',
              headers,
              credentials: 'include',
              body: JSON.stringify(row)
            });
            return { ok: res.ok, status: res.status };
          }
        } else if (mut.table === 'checkouts') {
          if (mut.action === 'RETURN') {
            const chkId = mut.data.id || mut.data.checkoutId;
            const res = await fetch(`/api/checkouts/${encodeURIComponent(chkId)}/return`, {
              method: 'POST',
              headers,
              credentials: 'include',
              body: JSON.stringify(mut.data)
            });
            return { ok: res.ok, status: res.status };
          } else {
            const row = mapCheckoutToTiDBRow(mut.data);
            const res = await fetch('/api/checkouts', {
              method: 'POST',
              headers,
              credentials: 'include',
              body: JSON.stringify(row)
            });
            return { ok: res.ok, status: res.status };
          }
        } else if (mut.table === 'maintenance') {
          if (mut.action === 'UPDATE') {
            const mntId = mut.data.id;
            const res = await fetch(`/api/maintenance/${encodeURIComponent(mntId)}`, {
              method: 'PUT',
              headers,
              credentials: 'include',
              body: JSON.stringify(mut.data)
            });
            return { ok: res.ok, status: res.status };
          } else {
            const row = mapMaintenanceToTiDBRow(mut.data);
            const res = await fetch('/api/maintenance', {
              method: 'POST',
              headers,
              credentials: 'include',
              body: JSON.stringify(row)
            });
            return { ok: res.ok, status: res.status };
          }
        } else if (mut.table === 'branches') {
          if (mut.action === 'DELETE') {
            const res = await fetch(`/api/branches/${encodeURIComponent(mut.data.id)}`, {
              method: 'DELETE',
              headers,
              credentials: 'include'
            });
            return { ok: res.ok, status: res.status };
          } else if (mut.action === 'UPDATE') {
            const res = await fetch(`/api/branches/${encodeURIComponent(mut.data.id)}`, {
              method: 'PUT',
              headers,
              credentials: 'include',
              body: JSON.stringify(mut.data)
            });
            return { ok: res.ok, status: res.status };
          } else {
            const res = await fetch('/api/branches', {
              method: 'POST',
              headers,
              credentials: 'include',
              body: JSON.stringify(mut.data)
            });
            return { ok: res.ok, status: res.status };
          }
        } else if (mut.table === 'users') {
          const res = await fetch(`/api/users/${encodeURIComponent(mut.data.id)}`, {
            method: 'PUT',
            headers,
            credentials: 'include',
            body: JSON.stringify(mut.data)
          });
          return { ok: res.ok, status: res.status };
        }
        return { ok: true, status: 200 };
      } catch (err: any) {
        return { ok: false, status: err?.status || 500, error: err?.message };
      }
    });

    return () => {
      unregisterExecutor();
    };
  }, []);

  // 1. Re-sync whenever tenant or user changes
  useEffect(() => {
    refreshAppData();
  }, [currentOrg?.id, currentUser?.id]);

  // 2. Cross-tab instant synchronization via browser storage events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.includes('omni_it_')) {
        refreshAppData();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 3. Multi-client real-time background sync: visibility-aware 30-60s interval with exponential error backoff
  useEffect(() => {
    let pollTimer: any = null;
    let errorCount = 0;

    const scheduleNextPoll = () => {
      const baseInterval = 30000; // 30s
      const backoff = Math.min(120000, baseInterval * Math.pow(1.5, Math.min(errorCount, 4)));
      pollTimer = setTimeout(async () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible' && navigator.onLine) {
          try {
            await refreshAppData();
            errorCount = 0;
          } catch {
            errorCount++;
          }
        }
        scheduleNextPoll();
      }, backoff);
    };

    scheduleNextPoll();

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && navigator.onLine) {
        refreshAppData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentOrg?.id, currentUser?.id]);

  // Run automated alerts evaluation on asset/checkout/maintenance changes
  useEffect(() => {
    if (currentOrg?.id) {
      evaluateAutomatedAlerts(assets, checkouts, maintenances, currentOrg.id);
    }
  }, [assets, checkouts, maintenances, currentOrg?.id]);

  // Filtered Assets based on Active Tenant, Branch Restriction, and Global Search
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      if (a.orgId && a.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        const matchesBranchId = Boolean(currentUser.branchId && a.branchId === currentUser.branchId);
        const matchesBranchName = Boolean(currentUser.branchName && a.branchName && a.branchName.toLowerCase() === currentUser.branchName.toLowerCase());
        const isAssignedToUser = Boolean(a.assignedToUserId && a.assignedToUserId === currentUser.id);
        if (!matchesBranchId && !matchesBranchName && !isAssignedToUser) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (a.name || '').toLowerCase().includes(q) ||
        (a.assetCode || '').toLowerCase().includes(q) ||
        (a.serialNumber || '').toLowerCase().includes(q) ||
        (a.categoryName && a.categoryName.toLowerCase().includes(q)) ||
        (a.model && a.model.toLowerCase().includes(q)) ||
        (a.assignedToUserName && a.assignedToUserName.toLowerCase().includes(q))
      );
    });
  }, [assets, currentOrg.id, isBranchRestricted, currentUser, searchQuery]);

  const filteredCheckouts = useMemo(() => {
    return checkouts.filter(c => {
      const asset = assets.find(a => a.id === c.assetId);
      if (!asset || asset.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        const matchesBranchId = Boolean(currentUser.branchId && asset.branchId === currentUser.branchId);
        const matchesBranchName = Boolean(currentUser.branchName && asset.branchName && asset.branchName.toLowerCase() === currentUser.branchName.toLowerCase());
        return matchesBranchId || matchesBranchName;
      }
      return true;
    });
  }, [checkouts, assets, currentOrg.id, isBranchRestricted, currentUser]);

  const filteredMaintenances = useMemo(() => {
    return maintenances.filter(m => {
      const asset = assets.find(a => a.id === m.assetId);
      if (!asset || asset.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        const matchesBranchId = Boolean(currentUser.branchId && asset.branchId === currentUser.branchId);
        const matchesBranchName = Boolean(currentUser.branchName && asset.branchName && asset.branchName.toLowerCase() === currentUser.branchName.toLowerCase());
        return matchesBranchId || matchesBranchName;
      }
      return true;
    });
  }, [maintenances, assets, currentOrg.id, isBranchRestricted, currentUser]);

  const filteredBudgets = useMemo(() => {
    return budgets.filter(b => {
      if (b.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        const userBranch = (currentUser.branchName || '').toLowerCase();
        const bBranch = (b.branchName || '').toLowerCase();
        return userBranch ? (bBranch === userBranch || bBranch.includes(userBranch)) : true;
      }
      return true;
    });
  }, [budgets, currentOrg.id, isBranchRestricted, currentUser]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (log.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        const userBranch = currentUser.branchName || '';
        return (
          (userBranch && (log.entityName || '').includes(userBranch)) ||
          (userBranch && (log.changes || '').includes(userBranch)) ||
          log.userName === currentUser.fullName
        );
      }
      return true;
    });
  }, [auditLogs, currentOrg.id, isBranchRestricted, currentUser]);

  // Asset CRUD
  const handleAddAsset = async (newAst: Asset) => {
    const updatedAssets = [newAst, ...assets];
    setAssets(updatedAssets);

    try {
      await persistAsset(newAst, updatedAssets, false);
      await refreshAppData();
    } catch (err: any) {
      setAssets(assets);
      addNotification({
        orgId: currentOrg.id,
        type: 'WARNING',
        title: 'Asset Registration Rejected',
        message: err.message || 'Duplicate or invalid data rejected by server.',
        read: false
      });
      throw err;
    }

    addNotification({
      orgId: currentOrg.id,
      type: 'ALERT',
      title: 'New Hardware Asset Registered',
      message: `${newAst.name} (${newAst.assetCode}) added to ${newAst.branchName}.`,
      read: false
    });
  };

  const handleUpdateAsset = async (updatedAst: Asset) => {
    const updatedAssets = assets.map(a => a.id === updatedAst.id ? updatedAst : a);
    setAssets(updatedAssets);

    try {
      await persistAsset(updatedAst, updatedAssets, true);
      await refreshAppData();
    } catch (err: any) {
      setAssets(assets);
      throw err;
    }
  };

  const handleDeleteAsset = async (astId: string) => {
    const remainingAssets = assets.filter(a => a.id !== astId);
    setAssets(remainingAssets);

    try {
      await deleteAssetFromDb(astId);
      await refreshAppData();
    } catch (err: any) {
      setAssets(assets);
      throw err;
    }
  };

  const handleBulkAddAssets = async (newAssets: Asset[]) => {
    const updatedAssets = [...newAssets, ...assets];
    setAssets(updatedAssets);

    try {
      await bulkPersistAssets(newAssets, updatedAssets);
      await refreshAppData();
    } catch {
      newAssets.forEach(a => queueOfflineMutation('assets', 'INSERT', a));
    }
  };

  const handleBatchUpdateStatus = async (assetIds: string[], newStatus: AssetStatus) => {
    const idSet = new Set(assetIds);
    const updatedAssets = assets.map(a => idSet.has(a.id) ? { ...a, status: newStatus } : a);
    setAssets(updatedAssets);

    for (const id of assetIds) {
      try {
        await fetch(`/api/assets/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: newStatus })
        });
      } catch {
        queueOfflineMutation('assets', 'UPDATE', { id, status: newStatus });
      }
    }
    await refreshAppData();
  };

  const handleBatchTransferBranch = async (assetIds: string[], targetBranchId: string, targetBranchName: string) => {
    const idSet = new Set(assetIds);
    const updatedAssets = assets.map(a => idSet.has(a.id) ? { ...a, branchId: targetBranchId, branchName: targetBranchName } : a);
    setAssets(updatedAssets);

    for (const id of assetIds) {
      try {
        await fetch(`/api/assets/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ branchId: targetBranchId, branchName: targetBranchName })
        });
      } catch {
        queueOfflineMutation('assets', 'UPDATE', { id, branchId: targetBranchId, branchName: targetBranchName });
      }
    }
    await refreshAppData();
  };

  const handleBatchDeleteAssets = async (assetIds: string[]) => {
    const idSet = new Set(assetIds);
    const remainingAssets = assets.filter(a => !idSet.has(a.id));
    setAssets(remainingAssets);

    for (const id of assetIds) {
      try {
        await fetch(`/api/assets/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include'
        });
      } catch {
        queueOfflineMutation('assets', 'DELETE', { id });
      }
    }
    await refreshAppData();
  };

  // Checkout Pipelines
  const handleNewCheckout = async (chk: CheckoutRecord, _updatedAsset?: Asset) => {
    const updatedCheckouts = [chk, ...checkouts];
    setCheckouts(updatedCheckouts);

    try {
      await persistCheckout(chk, updatedCheckouts);
      await refreshAppData();
    } catch {
      queueOfflineMutation('checkouts', 'INSERT', chk);
    }
  };

  const handleReturnAsset = async (chkId: string, returnCondition: string, notes?: string) => {
    const chk = checkouts.find(c => c.id === chkId);
    if (!chk) return;
    const nowIso = new Date().toISOString().split('T')[0]!;
    const updatedChk: CheckoutRecord = {
      ...chk,
      status: 'RETURNED',
      checkedInAt: nowIso,
      returnCondition: returnCondition as any,
      notes: notes || `Returned in condition: ${returnCondition}`
    };
    const updatedCheckouts = checkouts.map(c => c.id === chkId ? updatedChk : c);
    setCheckouts(updatedCheckouts);

    try {
      const res = await fetch(`/api/checkouts/${encodeURIComponent(chkId)}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          returnCondition,
          damageReported: returnCondition === 'DAMAGED' || returnCondition === 'POOR',
          damageDescription: returnCondition === 'DAMAGED' || returnCondition === 'POOR' ? notes || 'Equipment returned in damaged condition' : undefined,
          notes
        })
      });
      if (res.ok) {
        await refreshAppData();
      } else {
        throw new Error(`Return failed (HTTP ${res.status})`);
      }
    } catch {
      queueOfflineMutation('checkouts', 'RETURN', {
        id: chkId,
        returnCondition,
        damageReported: returnCondition === 'DAMAGED' || returnCondition === 'POOR',
        damageDescription: notes,
        notes
      });
    }
  };

  // Maintenance Pipelines
  const handleReportIssue = async (mnt: MaintenanceRecord) => {
    const updatedMaintenances = [mnt, ...maintenances];
    setMaintenances(updatedMaintenances);

    try {
      await persistMaintenance(mnt, updatedMaintenances);
      await refreshAppData();
    } catch {
      queueOfflineMutation('maintenance', 'INSERT', mnt);
    }
  };

  const handleCompleteRepair = async (mntId: string) => {
    const mnt = maintenances.find(m => m.id === mntId);
    if (!mnt) return;
    const nowIso = new Date().toISOString().split('T')[0]!;
    const updatedMnt: MaintenanceRecord = {
      ...mnt,
      status: 'COMPLETED',
      actualCompletion: nowIso
    };
    setMaintenances(maintenances.map(m => m.id === mntId ? updatedMnt : m));

    try {
      const res = await fetch(`/api/maintenance/${encodeURIComponent(mntId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: 'COMPLETED',
          actualCompletion: nowIso,
          baseVersion: mnt.version
        })
      });
      if (res.ok) {
        await refreshAppData();
      } else {
        throw new Error(`Maintenance update failed (HTTP ${res.status})`);
      }
    } catch {
      queueOfflineMutation('maintenance', 'UPDATE', {
        id: mntId,
        status: 'COMPLETED',
        actualCompletion: nowIso,
        baseVersion: mnt.version
      });
    }
  };

  const handleUpdateTicket = async (updatedRecord: MaintenanceRecord) => {
    setMaintenances(maintenances.map(m => m.id === updatedRecord.id ? updatedRecord : m));

    try {
      const res = await fetch(`/api/maintenance/${encodeURIComponent(updatedRecord.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: updatedRecord.status,
          cost: updatedRecord.cost,
          partsReplaced: updatedRecord.partsReplaced,
          notes: updatedRecord.notes,
          actualCompletion: updatedRecord.actualCompletion,
          baseVersion: updatedRecord.version
        })
      });
      if (res.ok) {
        await refreshAppData();
      } else {
        throw new Error(`Ticket update failed (HTTP ${res.status})`);
      }
    } catch {
      queueOfflineMutation('maintenance', 'UPDATE', updatedRecord);
    }
  };

  // Demo / Reset
  const handleLoadDemoData = () => {
    refreshAppData();
  };

  const handleResetCleanSlate = () => {
    refreshAppData();
  };

  return (
    <AssetContext.Provider
      value={{
        assets,
        checkouts,
        maintenances,
        budgets,
        auditLogs,
        filteredAssets,
        filteredCheckouts,
        filteredMaintenances,
        filteredBudgets,
        filteredAuditLogs,
        searchQuery,
        setSearchQuery,
        isTiDBLive,
        lastSyncedAt,
        tiDBSyncTime,
        showTiDBModal,
        setShowTiDBModal,
        refreshAppData,
        handleAddAsset,
        handleUpdateAsset,
        handleDeleteAsset,
        handleBulkAddAssets,
        handleBatchUpdateStatus,
        handleBatchTransferBranch,
        handleBatchDeleteAssets,
        handleNewCheckout,
        handleReturnAsset,
        handleReportIssue,
        handleCompleteRepair,
        handleUpdateTicket,
        handleLoadDemoData,
        handleResetCleanSlate
      }}
    >
      {children}
    </AssetContext.Provider>
  );
};

export const useAssets = () => {
  const context = useContext(AssetContext);
  if (!context) {
    throw new Error('useAssets must be used within an AssetProvider');
  }
  return context;
};
