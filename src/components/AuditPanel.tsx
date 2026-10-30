import React, { useState } from 'react';
import { AuditLogItem, Organization, User, Branch } from '../types';
import { 
  ShieldAlert, 
  Terminal, 
  Lock, 
  UserCheck, 
  ShieldCheck, 
  Users, 
  MapPin, 
  Edit2, 
  Save, 
  Plus, 
  Building2
} from 'lucide-react';
import { verifyServerAuditChain } from '../lib/audit';

interface AuditPanelProps {
  currentOrg: Organization;
  auditLogs: AuditLogItem[];
  currentUser: User | null;
  branches: Branch[];
  onUpdateBranch?: (branchId: string, updatedFields: Partial<Branch>) => void;
  onRegisterBranch?: (newBranch: any) => void;
  onNavigateToUsers?: () => void;
}

export const AuditPanel: React.FC<AuditPanelProps> = ({
  currentOrg,
  auditLogs,
  currentUser,
  branches = [],
  onUpdateBranch,
  onRegisterBranch,
  onNavigateToUsers
}) => {
  const orgLogs = auditLogs.filter(a => a.orgId === currentOrg.id);

  const isAdmin = currentUser?.role === 'ADMIN';

  // Right-hand tab state (Policy, Branches)
  const [activeRightTab, setActiveRightTab] = useState<'policy' | 'branches'>('policy');

  // Branch Creation State (Admin facility management)
  const [showCreateBranchModal, setShowCreateBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchCity, setNewBranchCity] = useState('');
  const [newBranchLocation, setNewBranchLocation] = useState('');
  const [newBranchCountry, setNewBranchCountry] = useState('Australia');
  const [newBranchManager, setNewBranchManager] = useState('');

  // Branch Editing State
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [editBranchCode, setEditBranchCode] = useState('');
  const [editBranchLocation, setEditBranchLocation] = useState('');
  const [editBranchCity, setEditBranchCity] = useState('');
  const [editBranchCountry, setEditBranchCountry] = useState('');
  const [editBranchManager, setEditBranchManager] = useState('');

  const [successMsg, setSuccessMsg] = useState('');
  const [isVerifyingChain, setIsVerifyingChain] = useState(false);
  const [chainVerification, setChainVerification] = useState<{
    valid: boolean;
    totalRecords: number;
    chainLength: number;
    genesisHash?: string;
    latestHash?: string;
    brokenAtSeq?: number;
    errors: string[];
  } | null>(null);

  const handleStartEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setEditBranchName(b.name);
    setEditBranchCode(b.code);
    setEditBranchLocation(b.location || '');
    setEditBranchCity(b.city || '');
    setEditBranchCountry(b.country || '');
    setEditBranchManager(b.managerName || '');
  };

  const handleSaveBranchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch || !onUpdateBranch) return;

    onUpdateBranch(editingBranch.id, {
      name: editBranchName.trim(),
      code: editBranchCode.trim().toUpperCase(),
      location: editBranchLocation.trim(),
      city: editBranchCity.trim(),
      country: editBranchCountry.trim(),
      managerName: editBranchManager.trim(),
    });

    setSuccessMsg(`Branch "${editBranchName}" has been successfully updated.`);
    setTimeout(() => setSuccessMsg(''), 4000);
    setEditingBranch(null);
  };

  const handleCreateBranchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim() || !newBranchCity.trim() || !onRegisterBranch) return;

    const codeClean = (newBranchCode.trim() || newBranchName.slice(0, 3)).toUpperCase();
    const newBranch: Branch = {
      id: `br-${Date.now()}`,
      orgId: currentOrg.id,
      name: newBranchName.trim(),
      code: codeClean,
      location: newBranchLocation.trim() || 'Site Office',
      city: newBranchCity.trim(),
      country: newBranchCountry.trim() || 'Australia',
      managerName: newBranchManager.trim() || currentUser?.fullName || 'Facility Manager'
    };

    onRegisterBranch(newBranch);
    setSuccessMsg(`Facility "${newBranch.name}" (${newBranch.code}) successfully added to ${currentOrg.name}.`);
    setTimeout(() => setSuccessMsg(''), 4000);

    setNewBranchName('');
    setNewBranchCode('');
    setNewBranchCity('');
    setNewBranchLocation('');
    setNewBranchManager('');
    setShowCreateBranchModal(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Header section */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 md:p-5 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <span>Real-Time Audit Stream &amp; Security Ledger</span>
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              {currentOrg.name}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cryptographic SHA-256 audit ledger, role-based access policy (RBAC), and operating branch facility allocation.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isAdmin && onNavigateToUsers && (
            <button
              onClick={onNavigateToUsers}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 font-medium rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Staff &amp; Users Roster &rarr;</span>
            </button>
          )}

          <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Multi-Tenant RBAC Active</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Audit Stream */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800 gap-2 flex-wrap">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Immutable Security Ledger</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setIsVerifyingChain(true);
                  const res = await verifyServerAuditChain();
                  setChainVerification(res);
                  setIsVerifyingChain(false);
                }}
                disabled={isVerifyingChain}
                className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-mono flex items-center gap-1.5 transition-all cursor-pointer"
                title="Verify cryptographic SHA-256 hash chaining across all tenant records"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isVerifyingChain ? 'Verifying...' : 'Verify SHA-256 Chain'}</span>
              </button>
              <span className="text-[10px] font-mono text-slate-400">Scoped to {currentOrg.name}</span>
            </div>
          </div>

          {chainVerification && (
            <div className={`mb-3 p-3 rounded-2xl border text-xs font-mono flex items-center justify-between ${
              chainVerification.valid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {chainVerification.valid
                    ? `✓ Hash Chain Intact: ${chainVerification.totalRecords} blocks verified via SHA-256`
                    : `⚠️ Chain Compromised: ${chainVerification.errors.join('; ')}`}
                </span>
              </div>
              <button
                onClick={() => setChainVerification(null)}
                className="text-slate-400 hover:text-white text-[10px] ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {orgLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/60 rounded-2xl border border-dashed border-slate-800">
                No transaction events recorded yet for this organization.
              </div>
            ) : (
              orgLogs.map(log => (
                <div key={log.id} className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {log.seq !== undefined && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                          #{log.seq}
                        </span>
                      )}
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-slate-800 text-emerald-300 rounded border border-slate-700">{log.action}</span>
                      <span className="text-xs font-bold text-white">{log.entityName}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">{log.timestamp}</span>
                  </div>

                  <p className="text-xs text-slate-300 mt-2 leading-snug">{log.changes}</p>

                  <div className="mt-2.5 pt-2 border-t border-slate-800/50 flex items-center justify-between text-[10px] text-slate-500 flex-wrap gap-1">
                    <div>Operator: <span className="text-slate-400 font-semibold">{log.userName}</span> ({log.userRole})</div>
                    <div className="flex items-center gap-2 font-mono">
                      {log.hash && (
                        <span className="text-indigo-400/80 text-[9px]" title={`SHA-256 Digest: ${log.hash}`}>
                          SHA-256: {log.hash.slice(0, 8)}...{log.hash.slice(-4)}
                        </span>
                      )}
                      <span>IP: {log.ipAddress}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Tabbed Panel: Access Policy, Users & Accounts, Branches */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col justify-between min-h-[500px]">
          <div>
            <div className="flex border-b border-slate-800 mb-4 pb-1 gap-1 flex-wrap">
              <button
                onClick={() => setActiveRightTab('policy')}
                className={`pb-2.5 px-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                  activeRightTab === 'policy'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Access Policy
              </button>
              <button
                onClick={() => setActiveRightTab('branches')}
                className={`pb-2.5 px-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                  activeRightTab === 'branches'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Operating Facilities {`(${branches.length})`}
              </button>
            </div>

            {onNavigateToUsers && (
              <div className="mb-4 p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-slate-300">
                    Employee roster, roles &amp; device custody managed in <strong>Staff &amp; Users</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToUsers}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] rounded-lg transition shrink-0 cursor-pointer"
                >
                  Open Directory &rarr;
                </button>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-2xl text-xs font-semibold animate-in fade-in duration-200">
                {successMsg}
              </div>
            )}

            {/* TAB 1: ACCESS POLICY */}
            {activeRightTab === 'policy' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center space-x-2 mb-2">
                  <Lock className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Access Control Policy</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="font-bold text-red-400 flex items-center justify-between"><span>ADMIN / DIRECTOR</span><UserCheck className="w-3.5 h-3.5" /></div>
                  <p className="text-[11px] text-slate-400 mt-1">Full cross-branch read/write, budget approvals, branch additions, and staff invitations.</p>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="font-bold text-amber-300 flex items-center justify-between"><span>BRANCH_MANAGER</span><UserCheck className="w-3.5 h-3.5" /></div>
                  <p className="text-[11px] text-slate-400 mt-1">Manage hardware, maintenance, and checkouts restricted strictly to their assigned branch.</p>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="font-bold text-blue-300 flex items-center justify-between"><span>IT_SUPPORT</span><UserCheck className="w-3.5 h-3.5" /></div>
                  <p className="text-[11px] text-slate-400 mt-1">Perform checkouts, execute repair tickets, and update device status across departments.</p>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="font-bold text-slate-300 flex items-center justify-between"><span>USER (Standard)</span><UserCheck className="w-3.5 h-3.5" /></div>
                  <p className="text-[11px] text-slate-400 mt-1">Restricted to viewing only devices assigned to their custody and reporting repair issues.</p>
                </div>
              </div>
            )}

            {/* TAB 2: OPERATING BRANCHES & ADDING FACILITIES */}
            {activeRightTab === 'branches' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-indigo-400" />
                    <span>Operating Facilities &amp; Branches</span>
                  </span>
                  {isAdmin && onRegisterBranch && (
                    <button
                      type="button"
                      onClick={() => setShowCreateBranchModal(true)}
                      className="px-2.5 py-1 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold text-[10px] rounded-lg shadow-sm transition uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Branch</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {branches.length === 0 ? (
                    <div className="text-center py-8 bg-slate-950 rounded-2xl border border-dashed border-slate-800 text-slate-500 text-xs">
                      No branches provisioned yet. Click "Add Branch" to create your first facility.
                    </div>
                  ) : (
                    branches.map(b => (
                      <div key={b.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5">
                            <span className="truncate">{b.name}</span>
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                              {b.code}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{b.location}, {b.city}</div>
                          <div className="text-[9px] text-slate-400 truncate mt-0.5">
                            Manager: <span className="font-semibold text-slate-300">{b.managerName}</span>
                          </div>
                        </div>

                        {isAdmin && onUpdateBranch && (
                          <button
                            onClick={() => handleStartEditBranch(b)}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition shrink-0 cursor-pointer"
                            title="Edit branch details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center text-[10px] text-slate-500">
            Dedicated workspace scoping active for {currentOrg.name}.
          </div>
        </div>
      </div>

      {/* ====================================================================
          MODAL: BRANCH REGISTRATION FOR COMPANY ADMINS
         ==================================================================== */}
      {showCreateBranchModal && isAdmin && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowCreateBranchModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg">✕</button>
            
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <span>Add Operating Branch Facility</span>
            </h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Add a regional office, warehouse, or site branch to allocate hardware products and laptops under {currentOrg.name}.
            </p>

            <form onSubmit={handleCreateBranchSubmit} className="space-y-3.5 text-xs font-sans">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Branch Facility Name *</label>
                <input
                  autoFocus
                  type="text"
                  required
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  placeholder="e.g. Melbourne Distribution Hub"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Branch Code</label>
                  <input
                    type="text"
                    value={newBranchCode}
                    onChange={e => setNewBranchCode(e.target.value)}
                    placeholder="e.g. MEL-HUB"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-indigo-500 focus:outline-none font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Manager Name</label>
                  <input
                    type="text"
                    value={newBranchManager}
                    onChange={e => setNewBranchManager(e.target.value)}
                    placeholder="e.g. Marcus Vance"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Street Address</label>
                <input
                  type="text"
                  value={newBranchLocation}
                  onChange={e => setNewBranchLocation(e.target.value)}
                  placeholder="e.g. 45 Logistics Way"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">City / Hub *</label>
                  <input
                    type="text"
                    required
                    value={newBranchCity}
                    onChange={e => setNewBranchCity(e.target.value)}
                    placeholder="e.g. Melbourne"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Country</label>
                  <input
                    type="text"
                    value={newBranchCountry}
                    onChange={e => setNewBranchCountry(e.target.value)}
                    placeholder="e.g. Australia"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateBranchModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Provision Facility</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 4: BRANCH EDIT MODAL
         ==================================================================== */}
      {editingBranch && isAdmin && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setEditingBranch(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg">✕</button>
            
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-1.5">
              <MapPin className="w-5 h-5 text-indigo-400" />
              <span>Edit Branch Location</span>
            </h3>
            <p className="text-[11px] text-slate-400 mb-4">Modify the configuration and identity metadata of this regional office.</p>

            <form onSubmit={handleSaveBranchSubmit} className="space-y-3.5 text-xs font-sans">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Branch Name *</label>
                <input
                  autoFocus
                  type="text"
                  required
                  value={editBranchName}
                  onChange={e => setEditBranchName(e.target.value)}
                  placeholder="e.g. Kalgoorlie Gold Pit Alpha"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Branch Code *</label>
                  <input
                    type="text"
                    required
                    value={editBranchCode}
                    onChange={e => setEditBranchCode(e.target.value)}
                    placeholder="e.g. KGO-ALPHA"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-emerald-500 focus:outline-none font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Manager Name</label>
                  <input
                    type="text"
                    value={editBranchManager}
                    onChange={e => setEditBranchManager(e.target.value)}
                    placeholder="e.g. Elena Rostova"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Street Address</label>
                <input
                  type="text"
                  value={editBranchLocation}
                  onChange={e => setEditBranchLocation(e.target.value)}
                  placeholder="e.g. 100 Mining Rd"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={editBranchCity}
                    onChange={e => setEditBranchCity(e.target.value)}
                    placeholder="e.g. Kalgoorlie"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Country *</label>
                  <input
                    type="text"
                    required
                    value={editBranchCountry}
                    onChange={e => setEditBranchCountry(e.target.value)}
                    placeholder="e.g. Australia"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingBranch(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
