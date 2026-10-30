import React, { useState, useEffect } from 'react';
import { CheckoutRecord, Asset, User, AssetCondition, Branch } from '../types';
import { CheckoutForm } from './CheckoutForm';
import { CheckinForm } from './CheckinForm';
import { CheckoutService } from '../lib/checkout-service';
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Filter,
  Search,
  HardDrive,
  UserCheck,
  UserX,
  UserPlus,
  FileText,
  Calendar,
  ShieldAlert,
  Layers,
  Wrench,
  RefreshCw,
  Eye,
  Phone,
  Mail
} from 'lucide-react';

interface CheckoutPanelProps {
  checkouts: CheckoutRecord[];
  assets: Asset[];
  users: User[];
  currentUser: User;
  branches: Branch[];
  onNewCheckout: (record: CheckoutRecord, updatedAsset: Asset) => void;
  onReturnAsset: (recordId: string, returnCondition: AssetCondition, damageReported: boolean, damageDesc: string, returnNotes: string) => void;
  onAssignCustody?: (assetId: string, userId: string) => void;
  onUnassignCustody?: (assetId: string, reason: string) => void;
}

export const CheckoutPanel: React.FC<CheckoutPanelProps> = ({
  checkouts,
  assets,
  users,
  currentUser,
  branches,
  onNewCheckout,
  onReturnAsset,
  onAssignCustody,
  onUnassignCustody
}) => {
  // Modals state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showUnassignModal, setShowUnassignModal] = useState(false);

  // Selected Targets
  const [targetAssetId, setTargetAssetId] = useState(assets[0]?.id || '');
  const [targetUserId, setTargetUserId] = useState(users[0]?.id || '');
  const [targetCheckoutRecord, setTargetCheckoutRecord] = useState<CheckoutRecord | null>(null);
  const [unassignReason, setUnassignReason] = useState('Standard rotation cycle');
  const ledgerRef = React.useRef<HTMLDivElement>(null);

  // Direct Assign Custom States
  const [assignType, setAssignType] = useState<'REGISTERED' | 'CUSTOM'>('REGISTERED');
  const [assignCustomName, setAssignCustomName] = useState('');
  const [assignBranchId, setAssignBranchId] = useState(branches[0]?.id || '');

  React.useEffect(() => {
    if (targetAssetId && assets.length > 0) {
      const selectedAsset = assets.find(a => a.id === targetAssetId);
      const catName = selectedAsset?.categoryName?.toLowerCase() || '';
      const isLaptopOrPhone = Boolean(
        catName.includes('laptop') ||
        catName.includes('phone') ||
        catName.includes('mobile') ||
        catName.includes('cell') ||
        catName.includes('smartphone') ||
        selectedAsset?.categoryId === 'cat-lap' ||
        selectedAsset?.categoryId === 'cat-phone'
      );
      if (isLaptopOrPhone) {
        setAssignType('CUSTOM');
      }
    }
  }, [targetAssetId, assets]);

  // Filters state (File 7 requirement)
  const [filterAsset, setFilterAsset] = useState('ALL');
  const [filterUser, setFilterUser] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'RETURNED' | 'OVERDUE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const isAdminOrSupport = currentUser.role === 'ADMIN' || currentUser.role === 'IT_SUPPORT';
  const isAdmin = currentUser.role === 'ADMIN';

  // Available pools
  const activeAssetsPool = assets.filter(a => a.status === 'ACTIVE' || a.status === 'REPAIR');
  const checkedOutAssetsPool = assets.filter(a => !!a.assignedToUserId);

  // Status helper
  const isRecordActive = (c: CheckoutRecord) => (c.status === 'ACTIVE' || (!c.checkedInAt && c.status !== 'RETURNED'));

  // Filter Checkouts
  const filteredCheckouts = checkouts.filter(c => {
    if (currentUser?.role === 'USER' && c.checkedOutToUserId !== currentUser.id) return false;
    if (filterAsset !== 'ALL' && c.assetId !== filterAsset) return false;
    if (filterUser !== 'ALL' && c.checkedOutToUserId !== filterUser) return false;
    const active = isRecordActive(c);
    if (filterStatus === 'ACTIVE' && !active) return false;
    if (filterStatus === 'RETURNED' && active) return false;
    if (filterStatus !== 'ALL' && filterStatus !== 'ACTIVE' && filterStatus !== 'RETURNED' && c.status !== filterStatus) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        (c.assetCode || '').toLowerCase().includes(q) ||
        (c.assetName || '').toLowerCase().includes(q) ||
        (c.checkedOutToUserName || '').toLowerCase().includes(q) ||
        (c.reason && c.reason.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Overdue count
  const today = new Date().toISOString().split('T')[0]!;
  const overdueCount = checkouts.filter(c => isRecordActive(c) && c.expectedReturnDate && c.expectedReturnDate < today).length;

  // Handle Checkout Execution
  const handleExecuteCheckout = (
    user: User | { id: string; fullName: string; email?: string; avatar?: string; role?: string },
    reason: string,
    expectedReturnDate: string,
    notes: string,
    targetBranchId?: string,
    targetBranchName?: string
  ) => {
    const ast = assets.find(a => a.id === targetAssetId);
    if (!ast) return;

    const res = CheckoutService.checkoutAsset({
      asset: ast,
      user,
      adminUser: currentUser,
      reason,
      expectedReturnDate,
      notes,
      targetBranchId,
      targetBranchName
    });

    onNewCheckout(res.checkout, res.updatedAsset);
    setShowCheckoutModal(false);
    alert(`Checkout executed! ${ast.assetCode} assigned to ${user.fullName}. Audit log entry written.`);
  };

  // Handle Checkin Execution (File 2 & File 6)
  const handleExecuteCheckin = (condition: AssetCondition, damageReported: boolean, damageDescription: string, notes: string) => {
    if (!targetCheckoutRecord) return;
    onReturnAsset(targetCheckoutRecord.id, condition, damageReported, damageDescription, notes);
    setShowCheckinModal(false);
    setTargetCheckoutRecord(null);
  };

  // Handle Assign (File 3)
  const handleDirectAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('RBAC Denial: Only organization ADMIN users can directly force custody assignment.');
      return;
    }

    const ast = assets.find(a => a.id === targetAssetId);
    if (!ast) return;

    let targetUser: User | { id: string; fullName: string; email?: string; avatar?: string; role?: string };
    if (assignType === 'REGISTERED') {
      const found = users.find(u => u.id === targetUserId);
      if (!found) return;
      targetUser = found;
    } else {
      if (!assignCustomName.trim()) {
        alert('Please specify an assignee name.');
        return;
      }
      targetUser = {
        id: `custom-${encodeURIComponent(assignCustomName.trim())}`,
        fullName: assignCustomName.trim(),
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(assignCustomName.trim())}`,
        email: 'Offline / External Custody',
        role: 'USER'
      };
    }

    const br = branches.find(b => b.id === assignBranchId) || branches[0];

    const res = CheckoutService.checkoutAsset({
      asset: ast,
      user: targetUser,
      adminUser: currentUser,
      reason: 'Admin Direct Assignment',
      expectedReturnDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]!,
      targetBranchId: br?.id,
      targetBranchName: br?.name
    });

    onNewCheckout(res.checkout, res.updatedAsset);
    setShowAssignModal(false);
    alert(`Direct custody assignment recorded. Device allocated to ${targetUser.fullName} at ${br?.name || 'registered branch'}.`);
  };

  // Handle Unassign (File 4)
  const handleDirectUnassignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('RBAC Denial: Only organization ADMIN users can revoke custody assignment.');
      return;
    }
    if (onUnassignCustody) onUnassignCustody(targetAssetId, unassignReason);
    setShowUnassignModal(false);
    alert('Asset unassigned and returned to general IT pool.');
  };

  // Handle Export CSV (File 7 requirement)
  const handleExportCSV = () => {
    const headers = ['Record ID', 'Asset Code', 'Asset Name', 'Checked Out To', 'Checked Out By Admin', 'Checkout Date', 'Expected Return', 'Return Date', 'Status', 'Reason', 'Return Condition'];
    const rows = filteredCheckouts.map(c => [
      `"${c.id}"`,
      `"${c.assetCode}"`,
      `"${c.assetName}"`,
      `"${c.checkedOutToUserName}"`,
      `"${c.checkedOutBy}"`,
      c.checkedOutAt,
      c.expectedReturnDate,
      c.checkedInAt || 'Active',
      c.status,
      `"${c.reason || ''}"`,
      c.returnCondition || 'N/A'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checkout_history_${Date.now()}.csv`;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Custody Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-100">
                Custody Checkout & Check-in
              </h1>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Secure Custody
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Manage equipment checkouts, return damage reporting, automated repair routing, and real-time custody logs.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
          {/* Overdue Alert Banner */}
          {overdueCount > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3 text-amber-300">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <strong className="text-amber-200 block">Overdue Hardware Alert ({overdueCount} Devices)</strong>
                  <span>Devices have surpassed their expected return check-in date. Admins can force return check-in below.</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setFilterStatus('OVERDUE');
                  ledgerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="px-3 py-1.5 bg-amber-500 text-slate-950 font-bold rounded-xl text-[11px] shrink-0"
              >
                View Overdue
              </button>
            </div>
          )}

          {/* Action Toolbar */}
          <div ref={ledgerRef} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 md:p-5 rounded-2xl shadow-xl">
            <div>
              <span className="text-sm font-bold text-slate-100 block">Transaction Ledger</span>
              <p className="text-[11px] text-slate-400">
                {currentUser.role === 'USER'
                  ? 'Showing your personal custody records and assigned equipment.'
                  : 'Full organizational audit view. Admin overrides available.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleExportCSV}
                className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export CSV</span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>Assign Custody</span>
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => setShowUnassignModal(true)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition flex items-center gap-1.5"
                >
                  <UserX className="w-3.5 h-3.5 text-rose-400" />
                  <span>Revoke Custody</span>
                </button>
              )}

              {isAdminOrSupport && (
                <button
                  onClick={() => setShowCheckoutModal(true)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Checkout</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 w-full max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter by asset code, employee, or reason..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-1.5 rounded-xl border border-slate-800">
                <Filter className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] uppercase text-slate-400 font-bold">Status:</span>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value as any)}
                  className="bg-transparent text-slate-200 font-mono focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900">ALL</option>
                  <option value="ACTIVE" className="bg-slate-900">ACTIVE</option>
                  <option value="RETURNED" className="bg-slate-900">RETURNED</option>
                  <option value="OVERDUE" className="bg-slate-900">OVERDUE</option>
                </select>
              </div>

              {isAdminOrSupport && (
                <div className="flex items-center gap-1 bg-slate-950 px-2 py-1.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold">User:</span>
                  <select
                    value={filterUser}
                    onChange={e => setFilterUser(e.target.value)}
                    className="bg-transparent text-slate-200 focus:outline-none cursor-pointer max-w-[130px]"
                  >
                    <option value="ALL" className="bg-slate-900">All Employees</option>
                    {users.map(u => <option key={u.id} value={u.id} className="bg-slate-900">{u.fullName}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Table View */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 border-collapse">
                <thead className="bg-slate-950 text-[10px] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-4">Hardware Asset</th>
                    <th className="p-4">Employee Custody</th>
                    <th className="p-4">Checkout Date</th>
                    <th className="p-4">Expected Return</th>
                    <th className="p-4">Purpose / Reason</th>
                    <th className="p-4">Status & Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredCheckouts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-500 font-mono">
                        No custody checkout records match active filter query.
                      </td>
                    </tr>
                  ) : (
                    filteredCheckouts.map(rec => {
                      const active = isRecordActive(rec);
                      const isOverdue = active && rec.expectedReturnDate && rec.expectedReturnDate < today;
                      return (
                        <tr key={rec.id} className="hover:bg-slate-850/60 transition">
                          <td className="p-4">
                            <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px]">
                              {rec.assetCode}
                            </span>
                            <div className="text-white font-semibold mt-1 truncate max-w-[180px]">{rec.assetName}</div>
                          </td>
                          <td className="p-4 font-medium text-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-sky-400">
                                {(rec.checkedOutToUserName || 'User').slice(0, 2).toUpperCase()}
                              </span>
                              <span>{rec.checkedOutToUserName || 'User'}</span>
                            </div>
                          </td>
                          <td className="p-4 font-mono text-slate-400 text-xs">{rec.checkedOutAt}</td>
                          <td className="p-4 font-mono text-xs">
                            {isOverdue ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 whitespace-nowrap">
                                {rec.expectedReturnDate} • Overdue
                              </span>
                            ) : (
                              <span className="text-slate-300 font-medium">
                                {rec.expectedReturnDate || 'Indefinite'}
                              </span>
                            )}
                          </td>
                          <td className="p-4 truncate max-w-[180px] text-slate-400 text-xs">
                            {rec.reason || 'Daily production use'}
                          </td>
                          <td className="p-4">
                            {active ? (
                              <button
                                onClick={() => {
                                  const targetAst = assets.find(a => a.id === rec.assetId);
                                  if (targetAst) {
                                    setTargetCheckoutRecord(rec);
                                    setShowCheckinModal(true);
                                  }
                                }}
                                className="px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                              >
                                <ArrowDownLeft className="w-3.5 h-3.5 text-sky-400" />
                                <span>Check-in Return</span>
                              </button>
                            ) : (
                              <div className="space-y-0.5 font-mono text-[10px]">
                                <span className="text-emerald-400 font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>RETURNED ({rec.checkedInAt})</span>
                                </span>
                                {rec.returnCondition && (
                                  <span className="text-slate-500 block">Cond: {rec.returnCondition}</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      {/* ====================================================================
          MODAL A: HARDWARE CHECKOUT FORM (FILE 5 & FILE 8 REQUIREMENT)
         ==================================================================== */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150">
          {activeAssetsPool.length === 0 ? (
            <div className="max-w-md w-full relative bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 shadow-2xl text-xs text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Assets Available for Checkout</h3>
                <p className="text-slate-400 mt-1.5 leading-relaxed">
                  {assets.length === 0
                    ? "Your organization currently has 0 hardware devices in the inventory. Please register or intake devices in the Assets tab first before issuing a checkout."
                    : "All registered hardware assets are currently assigned or undergoing maintenance."}
                </p>
              </div>
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-lg w-full relative">
              <div className="mb-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl text-xs flex items-center justify-between">
                <span className="text-slate-400">Select Target Device:</span>
                <select
                  value={targetAssetId}
                  onChange={e => setTargetAssetId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white rounded-xl px-2.5 py-1 font-mono focus:outline-none"
                >
                  {activeAssetsPool.map(a => <option key={a.id} value={a.id}>[{a.assetCode}] {a.name}</option>)}
                </select>
              </div>

              <CheckoutForm
                asset={activeAssetsPool.find(a => a.id === targetAssetId) || activeAssetsPool[0]!}
                users={users}
                branches={branches}
                adminUser={currentUser}
                onSubmitCheckout={handleExecuteCheckout}
                onCancel={() => setShowCheckoutModal(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          MODAL B: RETURN CHECK-IN FORM (FILE 6 & FILE 9 REQUIREMENT)
         ==================================================================== */}
      {showCheckinModal && targetCheckoutRecord && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150">
          <CheckinForm
            asset={assets.find(a => a.id === targetCheckoutRecord.assetId) || {
              id: targetCheckoutRecord.assetId,
              orgId: currentUser.orgId,
              branchId: branches[0]?.id || 'br-main',
              branchName: branches[0]?.name || 'Main Campus',
              categoryId: 'cat-gen',
              categoryName: 'Hardware',
              assetCode: targetCheckoutRecord.assetCode,
              name: targetCheckoutRecord.assetName,
              model: '',
              serialNumber: 'N/A',
              status: 'ACTIVE',
              condition: 'GOOD',
              purchaseDate: targetCheckoutRecord.checkedOutAt,
              purchaseCost: 0,
              currentValue: 0
            }}
            activeCheckout={targetCheckoutRecord}
            onSubmitCheckin={handleExecuteCheckin}
            onCancel={() => {
              setShowCheckinModal(false);
              setTargetCheckoutRecord(null);
            }}
          />
        </div>
      )}

      {/* ====================================================================
          MODAL C: ADMIN FORCE ASSIGN (FILE 3 REQUIREMENT)
         ==================================================================== */}
      {showAssignModal && (() => {
        if (assets.length === 0) {
          return (
            <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150">
              <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 shadow-2xl text-xs text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mx-auto">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">No Hardware Assets to Assign</h3>
                  <p className="text-slate-400 mt-1.5 leading-relaxed">
                    There are currently 0 hardware assets in the organization inventory. Please register devices in the Assets catalog first.
                  </p>
                </div>
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        }

        const selectedAssetForAssign = assets.find(a => a.id === targetAssetId) || assets[0];
        const catName = selectedAssetForAssign?.categoryName?.toLowerCase() || '';
        const isSelectedAssetLaptopOrPhone = Boolean(
          catName.includes('laptop') ||
          catName.includes('phone') ||
          catName.includes('mobile') ||
          catName.includes('cell') ||
          catName.includes('smartphone') ||
          selectedAssetForAssign?.categoryId === 'cat-lap' ||
          selectedAssetForAssign?.categoryId === 'cat-phone'
        );

        return (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl relative text-xs">
              <button onClick={() => setShowAssignModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-white">✕</button>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-sky-400" />
                <span>Admin Force Assign</span>
              </h3>
              <p className="text-slate-400 mt-1">Directly assigns custody and allocates target site location.</p>

              {isSelectedAssetLaptopOrPhone && (
                <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-2xl mt-3 text-sky-300">
                  <p className="font-semibold text-slate-100 flex items-center gap-1">
                    <UserPlus className="w-4 h-4 text-sky-400" />
                    <span>Device Custody Assignment</span>
                  </p>
                  <p className="text-[11px] mt-0.5 text-slate-400">
                    This is a portable Laptop/Cellphone. Please write the name of the person this device is given to.
                  </p>
                  {(selectedAssetForAssign?.phoneNumber || selectedAssetForAssign?.registeredEmail) && (
                    <div className="mt-2 pt-2 border-t border-sky-500/20 flex flex-wrap gap-2 text-[10.5px] font-mono">
                      {selectedAssetForAssign.phoneNumber && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Phone className="w-3 h-3" />
                          <span>{selectedAssetForAssign.phoneNumber}</span>
                        </span>
                      )}
                      {selectedAssetForAssign.registeredEmail && (
                        <span className="flex items-center gap-1 text-sky-300">
                          <Mail className="w-3 h-3" />
                          <span>{selectedAssetForAssign.registeredEmail}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleDirectAssignSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Target Hardware</label>
                  <select value={targetAssetId} onChange={e => setTargetAssetId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-sky-500">
                    {assets.map(a => <option key={a.id} value={a.id}>[{a.assetCode}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Assignment Type</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setAssignType('REGISTERED')}
                      className={`py-2 px-3 rounded-lg border text-center transition ${
                        assignType === 'REGISTERED' ? 'bg-sky-500/15 border-sky-500 text-sky-400 font-bold' : 'bg-slate-950/40 border-slate-800 text-slate-400'
                      }`}
                    >
                      Staff Account
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignType('CUSTOM')}
                      className={`py-2 px-3 rounded-lg border text-center transition ${
                        assignType === 'CUSTOM' ? 'bg-sky-500/15 border-sky-500 text-sky-400 font-bold' : 'bg-slate-950/40 border-slate-800 text-slate-400'
                      }`}
                    >
                      No Account Needed
                    </button>
                  </div>
                </div>

                {assignType === 'REGISTERED' ? (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Assign Employee Custody</label>
                    <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-sky-500">
                      {users.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      {isSelectedAssetLaptopOrPhone ? "Name of Person Given To *" : "Assignee Full Name"}
                    </label>
                    <input
                      type="text"
                      required
                      value={assignCustomName}
                      onChange={e => setAssignCustomName(e.target.value)}
                      placeholder={isSelectedAssetLaptopOrPhone ? "Write the name of the person given to..." : "Type name here (No login account needed)..."}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-sky-500 font-semibold"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Target Registered Location / Branch</label>
                  <select value={assignBranchId} onChange={e => setAssignBranchId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-sky-500">
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.city})</option>)}
                  </select>
                </div>

                <div className="pt-3 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowAssignModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl cursor-pointer">Cancel</button>
                  <button type="submit" className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl shadow-lg cursor-pointer">Confirm Assign</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ====================================================================
          MODAL D: ADMIN REVOKE / UNASSIGN (FILE 4 REQUIREMENT)
         ==================================================================== */}
      {showUnassignModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl relative text-xs">
            <button onClick={() => setShowUnassignModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer">✕</button>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <UserX className="w-5 h-5 text-rose-400" />
              <span>Revoke Asset Assignment</span>
            </h3>
            <p className="text-slate-400 mt-1">Clears active employee custody and returns equipment to general pool.</p>

            {checkedOutAssetsPool.length === 0 ? (
              <div className="mt-5 p-6 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-slate-300 font-semibold">No Active Custody Assignments</p>
                <p className="text-slate-500 text-[11px]">
                  There are currently no hardware devices with assigned custody in this organization.
                </p>
                <button
                  type="button"
                  onClick={() => setShowUnassignModal(false)}
                  className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleDirectUnassignSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Target Assigned Hardware</label>
                  <select value={targetAssetId} onChange={e => setTargetAssetId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white">
                    {checkedOutAssetsPool.map(a => <option key={a.id} value={a.id}>[{a.assetCode}] {a.name} (Held by: {a.assignedToUserName})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Revocation Reason *</label>
                  <input
                    type="text"
                    required
                    value={unassignReason}
                    onChange={e => setUnassignReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                  />
                </div>
                <div className="pt-3 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowUnassignModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl cursor-pointer">Cancel</button>
                  <button type="submit" className="px-5 py-2 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-xl shadow-lg cursor-pointer">Revoke Custody</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
