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
  loadInitialData,
  persistAsset,
  deleteAssetFromDb,
  bulkPersistAssets,
  persistCheckout,
  persistMaintenance,
  persistAuditLog,
  resetToUniversalDemoData,
  resetToCleanSlate,
  generateTiDBUpsertQuery,
  mapAssetToTiDBRow,
  mapCheckoutToTiDBRow,
  mapMaintenanceToTiDBRow
} from '../lib/tidb-storage';
import {
  isTiDBConfigured,
  getLastTiDBSyncTime,
  executeTiDBQuery,
  updateLastTiDBSyncTime
} from '../lib/tidb-client';
import { queueOfflineMutation, registerReplayExecutor } from '../lib/offline-sync';
import { commitAuditEvent } from '../lib/audit';
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
  handleAddAsset: (newAst: Asset) => void;
  handleUpdateAsset: (updatedAst: Asset) => void;
  handleDeleteAsset: (astId: string) => void;
  handleBulkAddAssets: (newAssets: Asset[]) => void;
  handleBatchUpdateStatus: (assetIds: string[], newStatus: AssetStatus) => void;
  handleBatchTransferBranch: (assetIds: string[], targetBranchId: string, targetBranchName: string) => void;
  handleBatchDeleteAssets: (assetIds: string[]) => void;
  handleNewCheckout: (chk: CheckoutRecord, updatedAsset?: Asset) => void;
  handleReturnAsset: (chkId: string, returnCondition: string) => void;
  handleReportIssue: (mnt: MaintenanceRecord) => void;
  handleCompleteRepair: (mntId: string) => void;
  handleUpdateTicket: (updatedRecord: MaintenanceRecord) => void;
  handleLoadDemoData: () => void;
  handleResetCleanSlate: () => void;
}

const AssetContext = createContext<AssetContextType | undefined>(undefined);

export const AssetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentOrg, currentUser, isBranchRestricted, handleSyncUsers, handleSyncBranches } = useAuth();
  const { addNotification, setNotifications, evaluateAutomatedAlerts } = useNotifications();

  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  const [checkouts, setCheckouts] = useState<CheckoutRecord[]>(INITIAL_CHECKOUTS);
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>(INITIAL_MAINTENANCE);
  const [budgets, setBudgets] = useState<BudgetAllocation[]>(INITIAL_BUDGETS);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOGS);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [lastSyncedAt, setLastSyncedAt] = useState<string>('TiDB Primary (HTAP)');
  const [isTiDBLive, setIsTiDBLive] = useState<boolean>(isTiDBConfigured());
  const [showTiDBModal, setShowTiDBModal] = useState<boolean>(false);
  const [tiDBSyncTime, setTiDBSyncTime] = useState<string>(getLastTiDBSyncTime());

  const refreshAppData = async () => {
    try {
      const data = await loadInitialData();
      setAssets(data.assets);
      setCheckouts(data.checkouts);
      setMaintenances(data.maintenances);
      setBudgets(data.budgets);
      setAuditLogs(data.auditLogs);
      setNotifications(data.notifications);
      handleSyncUsers(data.users);
      handleSyncBranches(data.branches);
      setLastSyncedAt(data.lastSyncedAt);
    } catch (err) {
      console.warn('Initial data load notice:', err);
    }
  };

  useEffect(() => {
    refreshAppData();

    // Register replay executor so online triggers and startup drain correctly
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
              credentials: 'include',
              body: JSON.stringify({ baseVersion: mut.baseVersion })
            });
            if (res.status === 409) {
              const err = new Error('HTTP 409 Conflict: Asset version mismatch on delete');
              (err as any).status = 409;
              throw err;
            }
            return res.ok;
          } else if (mut.action === 'UPDATE') {
            const row = mapAssetToTiDBRow(mut.data);
            const res = await fetch(`/api/assets/${encodeURIComponent(mut.data.id)}`, {
              method: 'PUT',
              headers,
              credentials: 'include',
              body: JSON.stringify({ ...row, baseVersion: mut.baseVersion })
            });
            if (res.status === 409) {
              const err = new Error('HTTP 409 Conflict: Asset version mismatch on update');
              (err as any).status = 409;
              throw err;
            }
            return res.ok;
          } else {
            const row = mapAssetToTiDBRow(mut.data);
            const res = await fetch('/api/assets', {
              method: 'POST',
              headers,
              credentials: 'include',
              body: JSON.stringify(row)
            });
            return res.ok;
          }
        } else if (mut.table === 'checkouts') {
          const row = mapCheckoutToTiDBRow(mut.data);
          const res = await fetch('/api/checkouts', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify(row)
          });
          return res.ok;
        } else if (mut.table === 'maintenance') {
          const row = mapMaintenanceToTiDBRow(mut.data);
          const res = await fetch('/api/maintenances', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ ...row, baseVersion: mut.baseVersion })
          });
          if (res.status === 409) {
            const err = new Error('HTTP 409 Conflict: Maintenance record version mismatch');
            (err as any).status = 409;
            throw err;
          }
          return res.ok;
        }
        return true;
      } catch (err: any) {
        if (err.status === 409) throw err;
        return false;
      }
    });

    const handleTiDBUpdate = () => {
      setIsTiDBLive(isTiDBConfigured());
      setTiDBSyncTime(getLastTiDBSyncTime());
    };
    window.addEventListener('tidb_config_updated', handleTiDBUpdate);

    return () => {
      unregisterExecutor();
      window.removeEventListener('tidb_config_updated', handleTiDBUpdate);
    };
  }, []);

  // Run automated alerts evaluation on asset/checkout/maintenance changes
  useEffect(() => {
    if (currentOrg?.id) {
      evaluateAutomatedAlerts(assets, checkouts, maintenances, currentOrg.id);
    }
  }, [assets, checkouts, maintenances, currentOrg?.id]);

  // Filtered Assets based on Active Tenant, Branch Restriction, and Global Search
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      if (a.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        if (a.branchId !== currentUser.branchId) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.assetCode.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q) ||
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
        return asset.branchId === currentUser.branchId;
      }
      return true;
    });
  }, [checkouts, assets, currentOrg.id, isBranchRestricted, currentUser]);

  const filteredMaintenances = useMemo(() => {
    return maintenances.filter(m => {
      const asset = assets.find(a => a.id === m.assetId);
      if (!asset || asset.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        return asset.branchId === currentUser.branchId;
      }
      return true;
    });
  }, [maintenances, assets, currentOrg.id, isBranchRestricted, currentUser]);

  const filteredBudgets = useMemo(() => {
    return budgets.filter(b => {
      if (b.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        return b.branchName.toLowerCase() === currentUser.branchName.toLowerCase() || b.branchName.includes(currentUser.branchName);
      }
      return true;
    });
  }, [budgets, currentOrg.id, isBranchRestricted, currentUser]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (log.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        return (
          log.entityName.includes(currentUser.branchName) ||
          log.changes.includes(currentUser.branchName) ||
          log.userName === currentUser.fullName
        );
      }
      return true;
    });
  }, [auditLogs, currentOrg.id, isBranchRestricted, currentUser]);

  // Asset CRUD: Primary TiDB Execution with Fallback Queue
  const handleAddAsset = async (newAst: Asset) => {
    const updatedAssets = [newAst, ...assets];
    setAssets(updatedAssets);

    // 1. Primary: TiDB SQL execution
    try {
      const row = mapAssetToTiDBRow(newAst);
      const q = generateTiDBUpsertQuery('assets', row);
      await executeTiDBQuery(q.sql, q.values);
    } catch {
      queueOfflineMutation('assets', 'INSERT', newAst, { baseVersion: newAst.version || 1 });
    }

    // 2. Persist locally
    persistAsset(newAst, updatedAssets);

    // 3. Audit trail
    const newLog = await commitAuditEvent({
      orgId: currentOrg.id,
      user: currentUser ? currentUser : { fullName: 'System Admin', role: 'ADMIN' },
      action: 'CREATE_ASSET',
      entityType: 'Asset',
      entityName: `${newAst.assetCode} (${newAst.name})`,
      changes: `Enrolled device into TiDB primary ledger. Valuation: $${newAst.purchaseCost}`
    });

    setAuditLogs(prev => [newLog, ...prev]);

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

    // 1. Primary: TiDB SQL execution
    try {
      const row = mapAssetToTiDBRow(updatedAst);
      const q = generateTiDBUpsertQuery('assets', row);
      await executeTiDBQuery(q.sql, q.values);
    } catch {
      queueOfflineMutation('assets', 'UPDATE', updatedAst, { baseVersion: updatedAst.version || 1 });
    }

    // 2. Persist locally
    persistAsset(updatedAst, updatedAssets);

    const newLog = await commitAuditEvent({
      orgId: currentOrg.id,
      user: currentUser ? currentUser : { fullName: 'System Admin', role: 'ADMIN' },
      action: 'UPDATE_ASSET',
      entityType: 'Asset',
      entityName: `${updatedAst.assetCode} (${updatedAst.name})`,
      changes: `Updated specifications and condition state in TiDB primary ledger.`
    });

    setAuditLogs(prev => [newLog, ...prev]);
  };

  const handleDeleteAsset = async (astId: string) => {
    const target = assets.find(a => a.id === astId);
    const remainingAssets = assets.filter(a => a.id !== astId);
    setAssets(remainingAssets);

    // 1. Primary TiDB
    try {
      await executeTiDBQuery('DELETE FROM `assets` WHERE `id` = ?;', [astId]);
    } catch {
      queueOfflineMutation('assets', 'DELETE', { id: astId }, { baseVersion: target?.version || 1 });
    }

    // 2. Persist locally
    deleteAssetFromDb(astId, remainingAssets);

    if (target) {
      const newLog = await commitAuditEvent({
        orgId: currentOrg.id,
        user: currentUser ? currentUser : { fullName: 'System Admin', role: 'ADMIN' },
        action: 'DELETE_ASSET',
        entityType: 'Asset',
        entityName: `${target.assetCode} (${target.name})`,
        changes: `Deleted asset record from TiDB primary inventory.`
      });

      setAuditLogs(prev => [newLog, ...prev]);
    }
  };

  const handleBulkAddAssets = async (newAssets: Asset[]) => {
    const updatedAssets = [...newAssets, ...assets];
    setAssets(updatedAssets);

    // 1. Primary TiDB
    try {
      for (const ast of newAssets) {
        const row = mapAssetToTiDBRow(ast);
        const q = generateTiDBUpsertQuery('assets', row);
        await executeTiDBQuery(q.sql, q.values);
      }
    } catch {
      newAssets.forEach(a => queueOfflineMutation('assets', 'INSERT', a));
    }

    // 2. Persist locally
    bulkPersistAssets(newAssets, updatedAssets);

    const newLog = await commitAuditEvent({
      orgId: currentOrg.id,
      user: currentUser ? currentUser : { fullName: 'System Admin', role: 'ADMIN' },
      action: 'BULK_IMPORT',
      entityType: 'Asset',
      entityName: `${newAssets.length} Assets`,
      changes: `Bulk imported ${newAssets.length} hardware assets into TiDB primary ledger`
    });

    setAuditLogs(prev => [newLog, ...prev]);
  };

  const handleBatchUpdateStatus = async (assetIds: string[], newStatus: AssetStatus) => {
    const idSet = new Set(assetIds);
    const updatedAssets = assets.map(a => idSet.has(a.id) ? { ...a, status: newStatus } : a);
    setAssets(updatedAssets);

    try {
      const placeholders = assetIds.map(() => '?').join(', ');
      await executeTiDBQuery(`UPDATE \`assets\` SET \`status\` = ? WHERE \`id\` IN (${placeholders});`, [newStatus, ...assetIds]);
    } catch {
      assetIds.forEach(id => queueOfflineMutation('assets', 'UPDATE', { id, status: newStatus }));
    }

    bulkPersistAssets(updatedAssets.filter(a => idSet.has(a.id)), updatedAssets);

    const newLog = await commitAuditEvent({
      orgId: currentOrg.id,
      user: currentUser ? currentUser : { fullName: 'System Admin', role: 'ADMIN' },
      action: 'UPDATE_ASSET',
      entityType: 'Asset',
      entityName: `${assetIds.length} Assets Batch Updated`,
      changes: `Batch updated status of ${assetIds.length} devices to ${newStatus} in TiDB`
    });

    setAuditLogs(prev => [newLog, ...prev]);
  };

  const handleBatchTransferBranch = async (assetIds: string[], targetBranchId: string, targetBranchName: string) => {
    const idSet = new Set(assetIds);
    const updatedAssets = assets.map(a => idSet.has(a.id) ? { ...a, branchId: targetBranchId, branchName: targetBranchName } : a);
    setAssets(updatedAssets);

    try {
      const placeholders = assetIds.map(() => '?').join(', ');
      await executeTiDBQuery(
        `UPDATE \`assets\` SET \`branch_id\` = ?, \`branch_name\` = ? WHERE \`id\` IN (${placeholders});`,
        [targetBranchId, targetBranchName, ...assetIds]
      );
    } catch {
      assetIds.forEach(id => queueOfflineMutation('assets', 'UPDATE', { id, branchId: targetBranchId, branchName: targetBranchName }));
    }

    bulkPersistAssets(updatedAssets.filter(a => idSet.has(a.id)), updatedAssets);

    const newLog = await commitAuditEvent({
      orgId: currentOrg.id,
      user: currentUser ? currentUser : { fullName: 'System Admin', role: 'ADMIN' },
      action: 'TRANSFER_ASSET',
      entityType: 'Asset',
      entityName: `${assetIds.length} Assets Transferred`,
      changes: `Batch transferred ${assetIds.length} devices to branch: ${targetBranchName}`
    });

    setAuditLogs(prev => [newLog, ...prev]);
  };

  const handleBatchDeleteAssets = async (assetIds: string[]) => {
    const idSet = new Set(assetIds);
    const remainingAssets = assets.filter(a => !idSet.has(a.id));
    setAssets(remainingAssets);

    try {
      const placeholders = assetIds.map(() => '?').join(', ');
      await executeTiDBQuery(`DELETE FROM \`assets\` WHERE \`id\` IN (${placeholders});`, assetIds);
    } catch {
      assetIds.forEach(id => queueOfflineMutation('assets', 'DELETE', { id }));
    }

    assetIds.forEach(id => deleteAssetFromDb(id, remainingAssets));

    const newLog = await commitAuditEvent({
      orgId: currentOrg.id,
      user: currentUser ? currentUser : { fullName: 'System Admin', role: 'ADMIN' },
      action: 'DELETE_ASSET',
      entityType: 'Asset',
      entityName: `${assetIds.length} Assets Batch Deleted`,
      changes: `Permanently removed ${assetIds.length} assets from TiDB primary inventory`
    });

    setAuditLogs(prev => [newLog, ...prev]);
  };

  // Checkout Pipelines
  const handleNewCheckout = async (chk: CheckoutRecord, updatedAsset?: Asset) => {
    const updatedCheckouts = [chk, ...checkouts];
    setCheckouts(updatedCheckouts);

    let updatedAssetsList = assets;
    let targetAsset = updatedAsset;
    if (targetAsset) {
      updatedAssetsList = assets.map(a => a.id === targetAsset!.id ? targetAsset! : a);
      setAssets(updatedAssetsList);
    } else {
      updatedAssetsList = assets.map(a => {
        if (a.id === chk.assetId) {
          targetAsset = { ...a, assignedToUserId: chk.checkedOutToUserId, assignedToUserName: chk.checkedOutToUserName, assignedAt: chk.checkedOutAt };
          return targetAsset;
        }
        return a;
      });
      setAssets(updatedAssetsList);
    }

    try {
      const row = mapCheckoutToTiDBRow(chk);
      const q = generateTiDBUpsertQuery('checkouts', row);
      await executeTiDBQuery(q.sql, q.values);

      if (targetAsset) {
        const astRow = mapAssetToTiDBRow(targetAsset);
        const astQ = generateTiDBUpsertQuery('assets', astRow);
        await executeTiDBQuery(astQ.sql, astQ.values);
      }
    } catch {
      queueOfflineMutation('checkouts', 'INSERT', chk);
      if (targetAsset) queueOfflineMutation('assets', 'UPDATE', targetAsset);
    }

    persistCheckout(chk, updatedCheckouts);
    if (targetAsset) persistAsset(targetAsset, updatedAssetsList);
    
    const newLog = await commitAuditEvent({
      orgId: currentOrg.id,
      user: currentUser ? currentUser : { fullName: 'System Admin', role: 'ADMIN' },
      action: 'CHECKOUT_ASSET',
      entityType: 'Checkout',
      entityName: chk.assetCode,
      changes: `Assigned custody of ${chk.assetCode} to ${chk.checkedOutToUserName}`
    });

    setAuditLogs(prev => [newLog, ...prev]);
  };

  const handleReturnAsset = async (chkId: string, returnCondition: string) => {
    const chk = checkouts.find(c => c.id === chkId);
    if (!chk) return;
    const nowIso = new Date().toISOString().split('T')[0]!;
    const updatedChk: CheckoutRecord = {
      ...chk,
      status: 'RETURNED',
      checkedInAt: nowIso,
      returnCondition: returnCondition as any,
      notes: `Returned in condition: ${returnCondition}`
    };
    const updatedCheckouts = checkouts.map(c => c.id === chkId ? updatedChk : c);
    setCheckouts(updatedCheckouts);

    const assetToRelease = assets.find(a => a.id === chk.assetId);
    let releasedAsset: Asset | undefined;
    let updatedAssetsList = assets;
    if (assetToRelease) {
      releasedAsset = {
        ...assetToRelease,
        assignedToUserId: undefined,
        assignedToUserName: undefined,
        assignedAt: undefined,
        condition: returnCondition as any
      };
      updatedAssetsList = assets.map(a => a.id === chk.assetId ? releasedAsset! : a);
      setAssets(updatedAssetsList);
    }

    try {
      const row = mapCheckoutToTiDBRow(updatedChk);
      const q = generateTiDBUpsertQuery('checkouts', row);
      await executeTiDBQuery(q.sql, q.values);

      if (releasedAsset) {
        const astRow = mapAssetToTiDBRow(releasedAsset);
        const astQ = generateTiDBUpsertQuery('assets', astRow);
        await executeTiDBQuery(astQ.sql, astQ.values);
      }
    } catch {
      queueOfflineMutation('checkouts', 'UPDATE', updatedChk);
      if (releasedAsset) queueOfflineMutation('assets', 'UPDATE', releasedAsset);
    }

    persistCheckout(updatedChk, updatedCheckouts);
    if (releasedAsset) persistAsset(releasedAsset, updatedAssetsList);
  };

  // Maintenance Pipelines
  const handleReportIssue = async (mnt: MaintenanceRecord) => {
    const updatedMaintenances = [mnt, ...maintenances];
    setMaintenances(updatedMaintenances);

    const asset = assets.find(a => a.id === mnt.assetId);
    let updatedAsset: Asset | undefined;
    let updatedAssetsList = assets;
    if (asset) {
      updatedAsset = { ...asset, status: 'REPAIR' };
      updatedAssetsList = assets.map(a => a.id === mnt.assetId ? updatedAsset! : a);
      setAssets(updatedAssetsList);
    }

    try {
      const row = mapMaintenanceToTiDBRow(mnt);
      const q = generateTiDBUpsertQuery('maintenances', row);
      await executeTiDBQuery(q.sql, q.values);

      if (updatedAsset) {
        const astRow = mapAssetToTiDBRow(updatedAsset);
        const astQ = generateTiDBUpsertQuery('assets', astRow);
        await executeTiDBQuery(astQ.sql, astQ.values);
      }
    } catch {
      queueOfflineMutation('maintenance', 'INSERT', mnt);
      if (updatedAsset) queueOfflineMutation('assets', 'UPDATE', updatedAsset);
    }

    persistMaintenance(mnt, updatedMaintenances);
    if (updatedAsset) persistAsset(updatedAsset, updatedAssetsList);
  };

  const handleCompleteRepair = async (mntId: string) => {
    const mnt = maintenances.find(m => m.id === mntId);
    if (!mnt) return;
    const updatedMnt: MaintenanceRecord = {
      ...mnt,
      status: 'COMPLETED',
      actualCompletion: new Date().toISOString().split('T')[0]!
    };
    const updatedMaintenances = maintenances.map(m => m.id === mntId ? updatedMnt : m);
    setMaintenances(updatedMaintenances);

    const asset = assets.find(a => a.id === mnt.assetId);
    let updatedAsset: Asset | undefined;
    let updatedAssetsList = assets;
    if (asset) {
      updatedAsset = { ...asset, status: 'ACTIVE' };
      updatedAssetsList = assets.map(a => a.id === mnt.assetId ? updatedAsset! : a);
      setAssets(updatedAssetsList);
    }

    try {
      const row = mapMaintenanceToTiDBRow(updatedMnt);
      const q = generateTiDBUpsertQuery('maintenances', row);
      await executeTiDBQuery(q.sql, q.values);

      if (updatedAsset) {
        const astRow = mapAssetToTiDBRow(updatedAsset);
        const astQ = generateTiDBUpsertQuery('assets', astRow);
        await executeTiDBQuery(astQ.sql, astQ.values);
      }
    } catch {
      queueOfflineMutation('maintenance', 'UPDATE', updatedMnt);
      if (updatedAsset) queueOfflineMutation('assets', 'UPDATE', updatedAsset);
    }

    persistMaintenance(updatedMnt, updatedMaintenances);
    if (updatedAsset) persistAsset(updatedAsset, updatedAssetsList);
  };

  const handleUpdateTicket = async (updatedRecord: MaintenanceRecord) => {
    const updatedMaintenances = maintenances.map(m => m.id === updatedRecord.id ? updatedRecord : m);
    setMaintenances(updatedMaintenances);

    let updatedAsset: Asset | undefined;
    let updatedAssetsList = assets;
    if (updatedRecord.status === 'COMPLETED') {
      const asset = assets.find(a => a.id === updatedRecord.assetId);
      if (asset) {
        updatedAsset = { ...asset, status: 'ACTIVE' };
        updatedAssetsList = assets.map(a => a.id === updatedRecord.assetId ? updatedAsset! : a);
        setAssets(updatedAssetsList);
      }
    }

    try {
      const row = mapMaintenanceToTiDBRow(updatedRecord);
      const q = generateTiDBUpsertQuery('maintenances', row);
      await executeTiDBQuery(q.sql, q.values);

      if (updatedAsset) {
        const astRow = mapAssetToTiDBRow(updatedAsset);
        const astQ = generateTiDBUpsertQuery('assets', astRow);
        await executeTiDBQuery(astQ.sql, astQ.values);
      }
    } catch {
      queueOfflineMutation('maintenance', 'UPDATE', updatedRecord);
    }

    persistMaintenance(updatedRecord, updatedMaintenances);
    if (updatedAsset) persistAsset(updatedAsset, updatedAssetsList);
  };

  // Demo / Reset
  const handleLoadDemoData = () => {
    const payload = resetToUniversalDemoData();
    setAssets(payload.assets);
    setCheckouts(payload.checkouts);
    setMaintenances(payload.maintenances);
    setBudgets(payload.budgets);
    setAuditLogs(payload.auditLogs);
    setNotifications(payload.notifications);
    handleSyncUsers(payload.users);
    handleSyncBranches(payload.branches);
    setLastSyncedAt(payload.lastSyncedAt);
  };

  const handleResetCleanSlate = () => {
    if (!currentUser) return;
    const payload = resetToCleanSlate(currentUser);
    setAssets(payload.assets);
    setCheckouts(payload.checkouts);
    setMaintenances(payload.maintenances);
    setBudgets(payload.budgets);
    setAuditLogs(payload.auditLogs);
    setNotifications(payload.notifications);
    handleSyncUsers(payload.users);
    handleSyncBranches(payload.branches);
    setLastSyncedAt(payload.lastSyncedAt);
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
