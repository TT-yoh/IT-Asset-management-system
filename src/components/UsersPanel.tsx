import React, { useState, useEffect, useMemo } from 'react';
import { User, Organization, Branch, Asset, AuditLogItem, Department } from '../types';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Mail, 
  MapPin, 
  Clock, 
  Search, 
  Filter, 
  Laptop, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  Copy, 
  Check, 
  Send,
  Building,
  Sparkles,
  ShieldAlert,
  ChevronRight,
  Edit2,
  Trash2,
  Ban,
  UserCheck,
  AlertTriangle,
  X,
  Shield,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { DEPARTMENTS } from '../mockData';

interface UsersPanelProps {
  currentOrg: Organization;
  users: User[];
  currentUser: User | null;
  branches: Branch[];
  departments?: Department[];
  assets: Asset[];
  auditLogs: AuditLogItem[];
  onRegisterUser?: (newUser: User) => void;
  onInviteUser?: (data: {
    fullName: string;
    email: string;
    role: any;
    departmentId?: string;
    departmentName?: string;
    branchId?: string;
    branchName?: string;
  }) => Promise<{ success: boolean; inviteToken?: string; user?: User; error?: string }>;
  onUpdateUser?: (updatedUser: User) => void;
  onDeleteUser?: (userId: string) => Promise<{ success: boolean; error?: string }>;
  onClearDummyUsers?: () => void;
}

export const UsersPanel: React.FC<UsersPanelProps> = ({
  currentOrg,
  users,
  currentUser,
  branches = [],
  departments = [],
  assets = [],
  auditLogs = [],
  onRegisterUser,
  onInviteUser,
  onUpdateUser,
  onDeleteUser,
  onClearDummyUsers
}) => {
  const activeDepts = departments && departments.length > 0 ? departments : DEPARTMENTS;

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Feedback Toast state
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg(current => current?.text === text ? null : current);
    }, 4500);
  };

  // Invitation Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<User['role']>('USER');
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || '');
  const [selectedDeptId, setSelectedDeptId] = useState(activeDepts[0]?.id || '');

  // Edit Staff Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<User['role']>('USER');
  const [editBranchId, setEditBranchId] = useState('');
  const [editDeptId, setEditDeptId] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INVITED' | 'SUSPENDED'>('ACTIVE');

  // Delete User Confirmation State
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Success Invite Modal
  const [showInviteSuccessModal, setShowInviteSuccessModal] = useState(false);
  const [latestInviteToken, setLatestInviteToken] = useState('');
  const [latestInvitedUser, setLatestInvitedUser] = useState<User | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [reinvitingId, setReinvitingId] = useState<string | null>(null);

  const orgUsers = users.filter(u => u.orgId === currentOrg.id);
  const isAdmin = currentUser?.role === 'ADMIN';

  // Filter pipeline
  const filteredUsers = orgUsers.filter(u => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (branchFilter !== 'ALL' && u.branchId !== branchFilter) return false;
    if (statusFilter !== 'ALL') {
      const currentStatus = u.status || 'ACTIVE';
      if (currentStatus !== statusFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.departmentName && u.departmentName.toLowerCase().includes(q)) ||
        (u.branchName && u.branchName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate statistics
  const activeCount = orgUsers.filter(u => (u.status || 'ACTIVE') === 'ACTIVE').length;
  const invitedCount = orgUsers.filter(u => u.status === 'INVITED').length;
  const suspendedCount = orgUsers.filter(u => u.status === 'SUSPENDED').length;
  const adminsCount = orgUsers.filter(u => u.role === 'ADMIN' || u.role === 'DIRECTOR').length;
  const itSupportCount = orgUsers.filter(u => u.role === 'IT_SUPPORT').length;

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'DIRECTOR': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'BRANCH_MANAGER': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'IT_SUPPORT': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'FINANCE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  // Get assigned assets count for a user
  const getUserAssets = (userId: string) => {
    return assets.filter(a => a.assignedToUserId === userId);
  };

  // Get last activity from audit log
  const getUserLastActivity = (userEmail: string, userName: string) => {
    const log = auditLogs.find(l => 
      l.orgId === currentOrg.id && 
      (l.userName === userName || (userEmail && l.changes && l.changes.toLowerCase().includes(userEmail.toLowerCase())))
    );
    return log ? `${log.action} • ${log.timestamp}` : 'Active session';
  };

  // Initiate Edit User Modal
  const handleStartEdit = (u: User) => {
    setEditingUser(u);
    setEditFullName(u.fullName);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditBranchId(u.branchId);
    setEditDeptId(u.departmentId);
    setEditStatus(u.status || 'ACTIVE');
  };

  // Save Edit User
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !onUpdateUser) return;

    const targetBranch = branches.find(b => b.id === editBranchId) || branches[0];
    const targetDept = activeDepts.find(d => d.id === editDeptId) || activeDepts[0];

    // Separation of Duties / Role Escalation Defense:
    // If editing self, role cannot be changed away from ADMIN, and status cannot be SUSPENDED
    const isEditingSelf = currentUser?.id === editingUser.id;
    const finalRole = isEditingSelf ? 'ADMIN' : editRole;
    const finalStatus = isEditingSelf ? 'ACTIVE' : editStatus;

    const updated: User = {
      ...editingUser,
      fullName: editFullName.trim(),
      email: editEmail.trim().toLowerCase(),
      role: finalRole,
      status: finalStatus,
      branchId: targetBranch ? targetBranch.id : editingUser.branchId,
      branchName: targetBranch ? targetBranch.name : editingUser.branchName,
      departmentId: targetDept ? targetDept.id : editingUser.departmentId,
      departmentName: targetDept ? targetDept.name : editingUser.departmentName,
    };

    onUpdateUser(updated);
    setEditingUser(null);
    showToast(`Staff member "${updated.fullName}" was updated successfully.`);
  };

  // Quick Toggle Account Suspension
  const handleToggleSuspend = (u: User) => {
    if (!onUpdateUser) return;
    if (currentUser?.id === u.id) {
      showToast('Separation of Duties: You cannot suspend your own active administrator account.', 'error');
      return;
    }

    const isCurrentlySuspended = u.status === 'SUSPENDED';
    const newStatus: User['status'] = isCurrentlySuspended ? 'ACTIVE' : 'SUSPENDED';
    const updatedUser: User = { ...u, status: newStatus };

    onUpdateUser(updatedUser);
    showToast(
      isCurrentlySuspended
        ? `Account for ${u.fullName} has been reactivated.`
        : `Account for ${u.fullName} has been suspended and access revoked.`,
      isCurrentlySuspended ? 'success' : 'info'
    );
  };

  // Request Delete User
  const handleRequestDelete = (u: User) => {
    if (currentUser?.id === u.id) {
      showToast('Separation of Duties: You cannot delete your own active administrator account.', 'error');
      return;
    }

    const userAssets = getUserAssets(u.id);
    if (userAssets.length > 0) {
      showToast(
        `Cannot remove ${u.fullName}: user currently holds custody of ${userAssets.length} asset(s). Return or reassign equipment first.`,
        'error'
      );
      return;
    }

    setUserToDelete(u);
    setDeleteError(null);
  };

  // Confirm Delete User
  const handleConfirmDelete = async () => {
    if (!userToDelete || !onDeleteUser) return;

    setIsDeleting(true);
    setDeleteError(null);

    const res = await onDeleteUser(userToDelete.id);
    setIsDeleting(false);

    if (!res.success) {
      setDeleteError(res.error || 'Failed to remove user account.');
      return;
    }

    showToast(`Staff account for ${userToDelete.fullName} has been removed.`, 'success');
    setUserToDelete(null);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newEmail.trim()) return;

    const branch = branches.find(b => b.id === selectedBranchId) || branches[0];
    const dept = activeDepts.find(d => d.id === selectedDeptId) || activeDepts[0];

    setIsInviting(true);
    try {
      if (onInviteUser) {
        const res = await onInviteUser({
          fullName: newFullName.trim(),
          email: newEmail.trim().toLowerCase(),
          role: newRole,
          departmentId: dept ? dept.id : 'dept-gen',
          departmentName: dept ? dept.name : 'General Operations',
          branchId: branch ? branch.id : (branches[0]?.id || 'br-main'),
          branchName: branch ? branch.name : (branches[0]?.name || 'Main Campus')
        });

        if (res.success && res.inviteToken) {
          setLatestInviteToken(res.inviteToken);
          if (res.user) setLatestInvitedUser(res.user);
          setShowInviteSuccessModal(true);
          setShowInviteModal(false);
          setNewFullName('');
          setNewEmail('');
          setNewRole('USER');
          showToast(`Verified invitation token created for ${res.user?.fullName || newFullName}.`);
          return;
        } else {
          showToast(res.error || 'Failed to create user invitation.');
          return;
        }
      }

      // Direct fallback
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullName: newFullName.trim(),
          email: newEmail.trim().toLowerCase(),
          role: newRole,
          departmentId: dept ? dept.id : 'dept-gen',
          departmentName: dept ? dept.name : 'General Operations',
          branchId: branch ? branch.id : (branches[0]?.id || 'br-main'),
          branchName: branch ? branch.name : (branches[0]?.name || 'Main Campus')
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        showToast(resData.error || 'Failed to invite user.');
        return;
      }

      const token = resData.inviteToken;
      const newUser: User = {
        id: resData.userId || `usr-${Date.now()}`,
        orgId: currentOrg.id,
        email: newEmail.trim().toLowerCase(),
        fullName: newFullName.trim(),
        role: newRole,
        departmentId: dept ? dept.id : 'dept-gen',
        departmentName: dept ? dept.name : 'General Operations',
        branchId: branch ? branch.id : (branches[0]?.id || 'br-main'),
        branchName: branch ? branch.name : (branches[0]?.name || 'Main Campus'),
        twoFactorEnabled: false,
        avatar: `https://images.unsplash.com/photo-${1534528741775 + (users.length % 10)}?w=100&auto=format&fit=crop&q=80`,
        status: 'INVITED',
        inviteToken: token,
        invitedAt: new Date().toISOString()
      };

      if (onRegisterUser) onRegisterUser(newUser);
      setLatestInviteToken(token);
      setLatestInvitedUser(newUser);
      setShowInviteSuccessModal(true);
      setShowInviteModal(false);

      setNewFullName('');
      setNewEmail('');
      setNewRole('USER');
      showToast(`Invitation created for ${newUser.fullName}.`);
    } catch (err: any) {
      showToast(err.message || 'Error creating user invitation.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleReinvite = async (targetUser: User) => {
    setReinvitingId(targetUser.id);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(targetUser.id)}/reinvite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.inviteToken) {
        const updated = { ...targetUser, inviteToken: data.inviteToken, invitedAt: data.invitedAt };
        if (onUpdateUser) onUpdateUser(updated);
        copyInviteLink(data.inviteToken);
        showToast(`Fresh invitation generated & link copied for ${targetUser.fullName}!`);
      } else {
        showToast(data.error || 'Failed to regenerate invitation link.');
      }
    } catch {
      showToast('Network error while requesting fresh invite.');
    } finally {
      setReinvitingId(null);
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/?invite=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('Invitation activation link copied to clipboard.');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between border shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 ${
          toastMsg.type === 'error'
            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            : toastMsg.type === 'info'
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {toastMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : toastMsg.type === 'info' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button 
            onClick={() => setToastMsg(null)} 
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Banner & KPI Stat Cards */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Staff & User Directory</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {orgUsers.length} Users Enrolled
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Live administrator oversight of system operators, assigned roles, security credentials, and equipment custody.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {isAdmin && onClearDummyUsers && (
              <button
                onClick={() => {
                  if (window.confirm("Purge demo staff accounts for this organization?")) {
                    onClearDummyUsers();
                    showToast('Demo accounts cleared.');
                  }
                }}
                className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Purge Demo Accounts
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Invite New Staff</span>
              </button>
            )}
          </div>
        </div>

        {/* 5 KPI Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Accounts</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">{activeCount}</div>
            <span className="text-[10px] text-slate-500">Verified corporate logins</span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Invites</span>
            <div className="text-2xl font-black text-amber-400 mt-1">{invitedCount}</div>
            <span className="text-[10px] text-slate-500">Awaiting activation token</span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Suspended</span>
            <div className="text-2xl font-black text-rose-400 mt-1">{suspendedCount}</div>
            <span className="text-[10px] text-slate-500">Access revoked</span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Admins & Governance</span>
            <div className="text-2xl font-black text-purple-400 mt-1">{adminsCount}</div>
            <span className="text-[10px] text-slate-500">Full control & policy</span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">IT & Field Techs</span>
            <div className="text-2xl font-black text-cyan-400 mt-1">{itSupportCount}</div>
            <span className="text-[10px] text-slate-500">Repair & diagnostics desk</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff by name, email, department, or branch..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="DIRECTOR">DIRECTOR</option>
            <option value="BRANCH_MANAGER">BRANCH_MANAGER</option>
            <option value="IT_SUPPORT">IT_SUPPORT</option>
            <option value="FINANCE">FINANCE</option>
            <option value="USER">USER</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INVITED">INVITED</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </div>

        {/* Branch Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Facility:</span>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Facilities</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Staff Roster Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Enrolled Operators & Staff ({filteredUsers.length})
            </h2>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Tenant: {currentOrg.name}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Operator / Staff</th>
                <th className="py-3 px-4">Corporate Role</th>
                <th className="py-3 px-4">Branch Facility</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Custody Assets</th>
                <th className="py-3 px-4">Security / 2FA</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    No staff members match the specified filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const userAssets = getUserAssets(user.id);
                  const isInvited = user.status === 'INVITED';
                  const isSuspended = user.status === 'SUSPENDED';
                  const isCurrentUser = currentUser?.id === user.id;

                  return (
                    <tr 
                      key={user.id} 
                      className={`transition-colors ${
                        isSuspended ? 'bg-rose-950/15 hover:bg-rose-950/25' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Name & Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={user.avatar}
                            alt={user.fullName}
                            className={`w-9 h-9 rounded-full object-cover border shrink-0 ${
                              isSuspended ? 'border-rose-500/40 grayscale' : 'border-slate-700'
                            }`}
                          />
                          <div>
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              <span className={isSuspended ? 'line-through text-slate-400' : ''}>
                                {user.fullName}
                              </span>
                              {isCurrentUser && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  YOU
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono block">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border ${getRoleBadgeColor(user.role)}`}>
                          {user.role}
                        </span>
                      </td>

                      {/* Branch */}
                      <td className="py-3 px-4 text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{user.branchName}</span>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-4 text-slate-400">
                        {user.departmentName}
                      </td>

                      {/* Hardware in Custody */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Laptop className="w-3.5 h-3.5 text-slate-500" />
                          <span className={`font-mono font-bold ${userAssets.length > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {userAssets.length} device{userAssets.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </td>

                      {/* Security / 2FA */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 w-fit ${
                          user.twoFactorEnabled 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          <Lock className="w-3 h-3" />
                          <span>{user.twoFactorEnabled ? '2FA ON' : 'Standard'}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {isInvited ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" />
                            <span>INVITED</span>
                          </span>
                        ) : isSuspended ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1 w-fit">
                            <Ban className="w-3 h-3" />
                            <span>SUSPENDED</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>ACTIVE</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isInvited && (
                            <>
                              {user.inviteToken ? (
                                <button
                                  type="button"
                                  onClick={() => copyInviteLink(user.inviteToken!)}
                                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                                  title="Copy Invitation Link"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span className="hidden sm:inline">Copy Link</span>
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleReinvite(user)}
                                disabled={reinvitingId === user.id}
                                className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                                title="Re-issue a fresh invitation token"
                              >
                                {reinvitingId === user.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                <span className="hidden sm:inline">Re-Invite</span>
                              </button>
                            </>
                          )}

                          {isAdmin && (
                            <>
                              {/* Edit Staff Details & Role */}
                              <button
                                type="button"
                                onClick={() => handleStartEdit(user)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs transition cursor-pointer"
                                title="Edit Staff Profile, Role & Branch"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Quick Suspend / Reactivate (Cannot suspend self or invited) */}
                              {!isCurrentUser && !isInvited && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleSuspend(user)}
                                  className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                                    isSuspended
                                      ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  }`}
                                  title={isSuspended ? 'Reactivate Account' : 'Suspend Account'}
                                >
                                  {isSuspended ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                                </button>
                              )}

                              {/* Remove / Delete Staff */}
                              {!isCurrentUser && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestDelete(user)}
                                  className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs transition cursor-pointer"
                                  title="Delete Staff Account"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Staff Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Modify Staff Account
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {editingUser.email}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="e.g. Rachel Adams"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    System Role *
                  </label>
                  <select
                    value={editRole}
                    disabled={currentUser?.id === editingUser.id}
                    onChange={(e) => setEditRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="USER">USER (Standard)</option>
                    <option value="IT_SUPPORT">IT_SUPPORT</option>
                    <option value="BRANCH_MANAGER">BRANCH_MANAGER</option>
                    <option value="FINANCE">FINANCE</option>
                    <option value="DIRECTOR">DIRECTOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  {currentUser?.id === editingUser.id && (
                    <span className="text-[10px] text-amber-400 mt-1 block">
                      Protected: Admin self-demotion prevented.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Account Status *
                  </label>
                  <select
                    value={editStatus}
                    disabled={currentUser?.id === editingUser.id}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                    <option value="INVITED">INVITED</option>
                  </select>
                  {currentUser?.id === editingUser.id && (
                    <span className="text-[10px] text-amber-400 mt-1 block">
                      Active session cannot be suspended.
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Facility Branch *
                  </label>
                  <select
                    value={editBranchId}
                    onChange={(e) => setEditBranchId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Department *
                  </label>
                  <select
                    value={editDeptId}
                    onChange={(e) => setEditDeptId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {activeDepts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  Save Modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-white">Remove Staff Account?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Are you sure you want to permanently delete <strong className="text-white">{userToDelete.fullName}</strong> ({userToDelete.email}) from {currentOrg.name}?
              </p>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1">
              <div><strong className="text-slate-300">Role:</strong> {userToDelete.role}</div>
              <div><strong className="text-slate-300">Facility:</strong> {userToDelete.branchName}</div>
              <div><strong className="text-slate-300">Department:</strong> {userToDelete.departmentName}</div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-600/20"
              >
                {isDeleting ? 'Removing...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Invite Staff Member
                </h3>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="e.g. Rachel Adams"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Corporate Email *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. rachel.adams@enterprise.io"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    System Role *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="USER">USER (Standard Employee)</option>
                    <option value="IT_SUPPORT">IT_SUPPORT (Helpdesk)</option>
                    <option value="BRANCH_MANAGER">BRANCH_MANAGER</option>
                    <option value="FINANCE">FINANCE</option>
                    <option value="DIRECTOR">DIRECTOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Facility Branch *
                  </label>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Department *
                </label>
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {activeDepts.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  Generate Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Invitation Modal */}
      {showInviteSuccessModal && latestInvitedUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <Check className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-white">Invitation Link Ready</h3>
              <p className="text-xs text-slate-400 mt-1">
                Share this activation token with <strong className="text-white">{latestInvitedUser.fullName}</strong> ({latestInvitedUser.email}).
              </p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 font-mono text-xs">
              <div className="text-slate-400 text-[10px] uppercase">Activation Link</div>
              <div className="text-emerald-400 break-all select-all">
                {window.location.origin}/?invite={latestInviteToken}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => copyInviteLink(latestInviteToken)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied to Clipboard!' : 'Copy Activation Link'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowInviteSuccessModal(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
