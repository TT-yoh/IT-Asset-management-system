import React, { useState } from 'react';
import { User, Organization, Branch, Asset, AuditLogItem } from '../types';
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
  ChevronRight
} from 'lucide-react';
import { DEPARTMENTS } from '../mockData';

interface UsersPanelProps {
  currentOrg: Organization;
  users: User[];
  currentUser: User | null;
  branches: Branch[];
  assets: Asset[];
  auditLogs: AuditLogItem[];
  onRegisterUser?: (newUser: User) => void;
  onClearDummyUsers?: () => void;
}

export const UsersPanel: React.FC<UsersPanelProps> = ({
  currentOrg,
  users,
  currentUser,
  branches = [],
  assets = [],
  auditLogs = [],
  onRegisterUser,
  onClearDummyUsers
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Invitation Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<User['role']>('USER');
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || '');
  const [selectedDeptId, setSelectedDeptId] = useState(DEPARTMENTS[0]?.id || '');

  // Success Modal
  const [showInviteSuccessModal, setShowInviteSuccessModal] = useState(false);
  const [latestInviteToken, setLatestInviteToken] = useState('');
  const [latestInvitedUser, setLatestInvitedUser] = useState<User | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

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
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.departmentName.toLowerCase().includes(q) ||
        u.branchName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Calculate statistics
  const activeCount = orgUsers.filter(u => (u.status || 'ACTIVE') === 'ACTIVE').length;
  const invitedCount = orgUsers.filter(u => u.status === 'INVITED').length;
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
      (l.userName === userName || (l.changes && l.changes.toLowerCase().includes(userEmail.toLowerCase())))
    );
    return log ? `${log.action} • ${log.timestamp}` : 'Active session';
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newEmail.trim() || !onRegisterUser) return;

    const branch = branches.find(b => b.id === selectedBranchId) || branches[0];
    const dept = DEPARTMENTS.find(d => d.id === selectedDeptId) || DEPARTMENTS[0];
    const token = 'inv-' + Math.random().toString(36).substring(2, 8) + Date.now().toString(36);

    const newUser: User = {
      id: `usr-${Date.now()}`,
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

    onRegisterUser(newUser);
    setLatestInviteToken(token);
    setLatestInvitedUser(newUser);
    setShowInviteSuccessModal(true);
    setShowInviteModal(false);

    setNewFullName('');
    setNewEmail('');
    setNewRole('USER');
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/?invite=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6">
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
                  }
                }}
                className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition"
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

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Admins & Leadership</span>
            <div className="text-2xl font-black text-rose-400 mt-1">{adminsCount}</div>
            <span className="text-[10px] text-slate-500">Full system governance</span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">IT & Field Techs</span>
            <div className="text-2xl font-black text-cyan-400 mt-1">{itSupportCount}</div>
            <span className="text-[10px] text-slate-500">Repair & checkout operators</span>
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
                <th className="py-3 px-4 text-right">Actions</th>
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
                  const isCurrentUser = currentUser?.id === user.id;

                  return (
                    <tr key={user.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Name & Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={user.avatar}
                            alt={user.fullName}
                            className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0"
                          />
                          <div>
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              <span>{user.fullName}</span>
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
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>ACTIVE</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {isInvited && user.inviteToken ? (
                          <button
                            type="button"
                            onClick={() => copyInviteLink(user.inviteToken!)}
                            className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 ml-auto cursor-pointer"
                            title="Copy Invitation Link"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy Link</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">
                            Verified
                          </span>
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
                  {DEPARTMENTS.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20"
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
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
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
