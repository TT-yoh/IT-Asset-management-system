import React, { useState } from 'react';
import { Branch, Department, Organization, User, Asset } from '../types';
import { 
  Building2, 
  MapPin, 
  Users, 
  Laptop, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  UserCheck, 
  DollarSign, 
  Briefcase, 
  Layers, 
  ArrowRight,
  X
} from 'lucide-react';

interface FacilitiesPanelProps {
  currentOrg: Organization;
  currentUser: User | null;
  branches: Branch[];
  departments: Department[];
  users: User[];
  assets: Asset[];
  onRegisterBranch: (newBranch: Branch) => void;
  onUpdateBranch: (branchId: string, updatedFields: Partial<Branch>) => void;
  onDeleteBranch: (branchId: string) => Promise<{ success: boolean; error?: string }>;
  onRegisterDepartment: (newDept: Department) => void;
  onUpdateDepartment: (deptId: string, updatedFields: Partial<Department>) => void;
  onDeleteDepartment: (deptId: string) => Promise<{ success: boolean; error?: string }>;
  onNavigateToTab?: (tab: string) => void;
}

export const FacilitiesPanel: React.FC<FacilitiesPanelProps> = ({
  currentOrg,
  currentUser,
  branches,
  departments,
  users,
  assets,
  onRegisterBranch,
  onUpdateBranch,
  onDeleteBranch,
  onRegisterDepartment,
  onUpdateDepartment,
  onDeleteDepartment,
  onNavigateToTab
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  // Sub-tab: 'branches' | 'departments'
  const [activeTab, setActiveTab] = useState<'branches' | 'departments'>('branches');
  const [searchQuery, setSearchQuery] = useState('');

  // Toast / notification feedback
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(current => current?.text === text ? null : current), 4000);
  };

  // --- Branch Modal States ---
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchLocation, setBranchLocation] = useState('');
  const [branchCity, setBranchCity] = useState('');
  const [branchCountry, setBranchCountry] = useState('');
  const [branchManagerName, setBranchManagerName] = useState('');
  const [branchManagerUserId, setBranchManagerUserId] = useState('');

  // Delete Branch Confirmation
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);
  const [deleteBranchError, setDeleteBranchError] = useState<string | null>(null);
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);

  // --- Department Modal States ---
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptBudget, setDeptBudget] = useState('150000');

  // Delete Department Confirmation
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null);
  const [deleteDeptError, setDeleteDeptError] = useState<string | null>(null);
  const [isDeletingDept, setIsDeletingDept] = useState(false);

  // Filtered lists
  const orgBranches = branches.filter(b => b.orgId === currentOrg.id);
  const orgDepartments = departments.filter(d => d.orgId === currentOrg.id);
  const orgUsers = users.filter(u => u.orgId === currentOrg.id);
  const orgAssets = assets.filter(a => a.orgId === currentOrg.id);

  const filteredBranches = orgBranches.filter(b => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (b.name || '').toLowerCase().includes(q) ||
      (b.code || '').toLowerCase().includes(q) ||
      (b.city && b.city.toLowerCase().includes(q)) ||
      (b.country && b.country.toLowerCase().includes(q)) ||
      (b.managerName && b.managerName.toLowerCase().includes(q))
    );
  });

  const filteredDepartments = orgDepartments.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (d.name || '').toLowerCase().includes(q);
  });

  // Calculate metrics
  const totalAllocatedBudget = orgDepartments.reduce((acc, d) => acc + (d.budgetAllocated || 0), 0);

  // --- Branch Handlers ---
  const handleOpenCreateBranch = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchCode(`BR-${Math.floor(100 + Math.random() * 900)}`);
    setBranchLocation('');
    setBranchCity('');
    setBranchCountry('United States');
    setBranchManagerName('');
    setBranchManagerUserId('');
    setShowBranchModal(true);
  };

  const handleOpenEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setBranchName(b.name);
    setBranchCode(b.code);
    setBranchLocation(b.location);
    setBranchCity(b.city);
    setBranchCountry(b.country);
    setBranchManagerName(b.managerName);
    const matchedUser = orgUsers.find(u => u.fullName.toLowerCase() === b.managerName.toLowerCase());
    setBranchManagerUserId(matchedUser ? matchedUser.id : '');
    setShowBranchModal(true);
  };

  const handleBranchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim() || !branchCity.trim()) return;

    let finalManagerName = branchManagerName.trim() || 'Unassigned';
    if (branchManagerUserId) {
      const selectedUser = orgUsers.find(u => u.id === branchManagerUserId);
      if (selectedUser) {
        finalManagerName = selectedUser.fullName;
      }
    }

    if (editingBranch) {
      onUpdateBranch(editingBranch.id, {
        name: branchName.trim(),
        code: branchCode.trim().toUpperCase(),
        location: branchLocation.trim() || 'Main Site Facility',
        city: branchCity.trim(),
        country: branchCountry.trim() || 'Global',
        managerName: finalManagerName
      });
      showToast(`Facility "${branchName}" updated successfully.`);
    } else {
      const newBranch: Branch = {
        id: `br-${Date.now()}`,
        orgId: currentOrg.id,
        name: branchName.trim(),
        code: branchCode.trim().toUpperCase(),
        location: branchLocation.trim() || 'Main Site Facility',
        city: branchCity.trim(),
        country: branchCountry.trim() || 'Global',
        managerName: finalManagerName
      };
      onRegisterBranch(newBranch);
      showToast(`New facility "${newBranch.name}" created successfully.`);
    }

    setShowBranchModal(false);
  };

  const handleRequestDeleteBranch = (b: Branch) => {
    const assignedAssetsCount = orgAssets.filter(a => a.branchId === b.id).length;
    const assignedUsersCount = orgUsers.filter(u => u.branchId === b.id).length;

    if (assignedAssetsCount > 0) {
      showToast(`Cannot remove "${b.name}": ${assignedAssetsCount} active asset(s) are stationed here. Reassign assets first.`, 'error');
      return;
    }
    if (assignedUsersCount > 0) {
      showToast(`Cannot remove "${b.name}": ${assignedUsersCount} staff member(s) are assigned to this facility. Reassign staff first.`, 'error');
      return;
    }
    if (orgBranches.length <= 1) {
      showToast('Cannot delete the organization\'s only operating facility.', 'error');
      return;
    }

    setBranchToDelete(b);
    setDeleteBranchError(null);
  };

  const handleConfirmDeleteBranch = async () => {
    if (!branchToDelete) return;
    setIsDeletingBranch(true);
    setDeleteBranchError(null);

    const res = await onDeleteBranch(branchToDelete.id);
    setIsDeletingBranch(false);

    if (!res.success) {
      setDeleteBranchError(res.error || 'Failed to delete facility.');
      return;
    }

    showToast(`Facility "${branchToDelete.name}" has been removed.`);
    setBranchToDelete(null);
  };

  // --- Department Handlers ---
  const handleOpenCreateDept = () => {
    setEditingDept(null);
    setDeptName('');
    setDeptBudget('100000');
    setShowDeptModal(true);
  };

  const handleOpenEditDept = (d: Department) => {
    setEditingDept(d);
    setDeptName(d.name);
    setDeptBudget(String(d.budgetAllocated || 0));
    setShowDeptModal(true);
  };

  const handleDeptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim()) return;

    const budgetNum = parseFloat(deptBudget) || 0;

    if (editingDept) {
      onUpdateDepartment(editingDept.id, {
        name: deptName.trim(),
        budgetAllocated: budgetNum
      });
      showToast(`Department "${deptName}" updated successfully.`);
    } else {
      const newDept: Department = {
        id: `dept-${Date.now()}`,
        orgId: currentOrg.id,
        name: deptName.trim(),
        headCount: 0,
        budgetAllocated: budgetNum
      };
      onRegisterDepartment(newDept);
      showToast(`Department "${newDept.name}" created successfully.`);
    }

    setShowDeptModal(false);
  };

  const handleRequestDeleteDept = (d: Department) => {
    const assignedUsersCount = orgUsers.filter(u => u.departmentId === d.id).length;
    if (assignedUsersCount > 0) {
      showToast(`Cannot remove "${d.name}": ${assignedUsersCount} staff member(s) belong to this department. Reassign staff first.`, 'error');
      return;
    }
    if (orgDepartments.length <= 1) {
      showToast('Cannot delete the organization\'s only operating department.', 'error');
      return;
    }

    setDeptToDelete(d);
    setDeleteDeptError(null);
  };

  const handleConfirmDeleteDept = async () => {
    if (!deptToDelete) return;
    setIsDeletingDept(true);
    setDeleteDeptError(null);

    const res = await onDeleteDepartment(deptToDelete.id);
    setIsDeletingDept(false);

    if (!res.success) {
      setDeleteDeptError(res.error || 'Failed to delete department.');
      return;
    }

    showToast(`Department "${deptToDelete.name}" has been removed.`);
    setDeptToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 p-4 rounded-2xl border shadow-2xl flex items-center gap-3 text-xs font-semibold animate-in fade-in slide-in-from-top-4 duration-200 ${
          toast.type === 'error'
            ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
            : toast.type === 'info'
              ? 'bg-sky-950/90 border-sky-500/40 text-sky-200'
              : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 relative overflow-hidden backdrop-blur-xl shadow-xl">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-emerald-400 to-cyan-400" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px] font-semibold text-indigo-400 mb-2">
              <Building2 className="w-3.5 h-3.5" />
              <span>Multi-Tenant Infrastructure</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300 font-mono">{currentOrg.name}</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Facility &amp; Branch Administration</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Provision regional offices, assign facility branch managers, and structure departmental cost centers with isolated resource scoping.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && activeTab === 'branches' && (
              <button
                type="button"
                onClick={handleOpenCreateBranch}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Facility / Branch</span>
              </button>
            )}

            {isAdmin && activeTab === 'departments' && (
              <button
                type="button"
                onClick={handleOpenCreateDept}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Department</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Total Facilities</span>
            <Building2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white">{orgBranches.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Active regional sites</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Departments</span>
            <Briefcase className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white">{orgDepartments.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Operational cost centers</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Stationed Staff</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{orgUsers.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Across all facilities</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Budget Allocated</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white">${(totalAllocatedBudget / 1000).toFixed(0)}k</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Annual departmental budget</div>
        </div>
      </div>

      {/* Main Tab Controller & Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('branches')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'branches'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Operating Facilities ({orgBranches.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('departments')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'departments'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Departments &amp; Cost Centers ({orgDepartments.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'branches' ? 'Search by name, code, city...' : 'Search departments...'}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* ====================================================================
          TAB A: OPERATING FACILITIES & BRANCHES
         ==================================================================== */}
      {activeTab === 'branches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBranches.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-6 text-slate-500">
              <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-300">No facilities matching query</div>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Try searching for another city, code, or click "Add Facility / Branch" to create a new branch.
              </p>
            </div>
          ) : (
            filteredBranches.map(branch => {
              const branchStaff = orgUsers.filter(u => u.branchId === branch.id);
              const branchAssets = orgAssets.filter(a => a.branchId === branch.id);

              return (
                <div
                  key={branch.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-3xl p-5 flex flex-col justify-between transition shadow-md group relative overflow-hidden"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition">
                            {branch.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{branch.location}, {branch.city}</span>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 shrink-0">
                        {branch.code}
                      </span>
                    </div>

                    {/* Facility Country & Manager Row */}
                    <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Facility Manager</span>
                        <span className="font-semibold text-slate-200 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{branch.managerName || 'Unassigned'}</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Jurisdiction</span>
                        <span className="font-medium text-slate-300">{branch.country || 'Global'}</span>
                      </div>
                    </div>

                    {/* Hardware & Staff Metric Pills */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 text-center">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase flex items-center justify-center gap-1">
                          <Laptop className="w-3 h-3 text-cyan-400" />
                          <span>Hardware</span>
                        </div>
                        <div className="text-base font-black text-slate-100 mt-0.5">{branchAssets.length}</div>
                      </div>

                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 text-center">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase flex items-center justify-center gap-1">
                          <Users className="w-3 h-3 text-emerald-400" />
                          <span>Staff</span>
                        </div>
                        <div className="text-base font-black text-slate-100 mt-0.5">{branchStaff.length}</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  {isAdmin && (
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="text-[10px] text-slate-500">
                        ID: <span className="font-mono text-slate-400">{branch.id}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditBranch(branch)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                          title="Edit branch details & reassign manager"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRequestDeleteBranch(branch)}
                          className="p-1.5 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-xl transition cursor-pointer"
                          title="Delete branch facility"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ====================================================================
          TAB B: DEPARTMENTS & COST CENTERS
         ==================================================================== */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDepartments.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-6 text-slate-500">
              <Briefcase className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-300">No departments found</div>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Click "Add Department" to create organizational divisions and allocate capital budgets.
              </p>
            </div>
          ) : (
            filteredDepartments.map(dept => {
              const deptStaff = orgUsers.filter(u => u.departmentId === dept.id);
              const deptAssets = orgAssets.filter(a => {
                const holder = orgUsers.find(u => u.id === a.assignedToUserId);
                return holder ? holder.departmentId === dept.id : false;
              });

              return (
                <div
                  key={dept.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-3xl p-5 flex flex-col justify-between transition shadow-md group relative overflow-hidden"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-white group-hover:text-purple-400 transition">
                          {dept.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Corporate Cost Center</p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/25 shrink-0">
                        ${((dept.budgetAllocated || 0) / 1000).toFixed(0)}k Allocated
                      </span>
                    </div>

                    <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Assigned Headcount</span>
                        <span className="font-semibold text-slate-200">{deptStaff.length} active employee(s)</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Active Deployed Equipment</span>
                        <span className="font-semibold text-slate-200">{deptAssets.length} asset(s)</span>
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="text-[10px] text-slate-500">
                        ID: <span className="font-mono text-slate-400">{dept.id}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditDept(dept)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRequestDeleteDept(dept)}
                          className="p-1.5 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-xl transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ====================================================================
          MODAL: ADD / EDIT BRANCH FACILITY
         ==================================================================== */}
      {showBranchModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowBranchModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 mb-1">
                <Building2 className="w-4 h-4" />
                <span>{editingBranch ? 'Edit Facility' : 'Provision Facility'}</span>
              </div>
              <h2 className="text-xl font-black text-white">
                {editingBranch ? `Update ${editingBranch.name}` : 'Add Operating Branch Facility'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure facility operational parameters, location addresses, and appoint an active facility manager.
              </p>
            </div>

            <form onSubmit={handleBranchSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Facility Name *
                </label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g. Melbourne Distribution Hub"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Facility Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    placeholder="e.g. MEL-01"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-indigo-300 font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={branchCity}
                    onChange={(e) => setBranchCity(e.target.value)}
                    placeholder="e.g. Melbourne"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Street Address / Floor
                  </label>
                  <input
                    type="text"
                    value={branchLocation}
                    onChange={(e) => setBranchLocation(e.target.value)}
                    placeholder="e.g. 450 Flinders St, Level 4"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Country
                  </label>
                  <input
                    type="text"
                    value={branchCountry}
                    onChange={(e) => setBranchCountry(e.target.value)}
                    placeholder="e.g. Australia"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Appoint Facility Manager from User Directory */}
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Appoint Facility Branch Manager
                </label>
                <div className="relative">
                  <select
                    value={branchManagerUserId}
                    onChange={(e) => {
                      setBranchManagerUserId(e.target.value);
                      const user = orgUsers.find(u => u.id === e.target.value);
                      if (user) {
                        setBranchManagerName(user.fullName);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer"
                  >
                    <option value="">-- Appoint from active staff list --</option>
                    {orgUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.role} • {u.email})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Selected manager receives scoped hardware oversight and approval capabilities for this branch.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                >
                  {editingBranch ? 'Save Changes' : 'Create Facility'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: ADD / EDIT DEPARTMENT
         ==================================================================== */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowDeptModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-400 mb-1">
                <Briefcase className="w-4 h-4" />
                <span>{editingDept ? 'Edit Department' : 'Create Department'}</span>
              </div>
              <h2 className="text-xl font-black text-white">
                {editingDept ? `Update ${editingDept.name}` : 'New Department'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Define an operational division to organize staff members and budget hardware allocation.
              </p>
            </div>

            <form onSubmit={handleDeptSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Department Name *
                </label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Information Technology & Cloud Ops"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Annual Hardware Budget Allocation ($) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={deptBudget}
                  onChange={(e) => setDeptBudget(e.target.value)}
                  placeholder="e.g. 150000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-emerald-300 font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-purple-500/20 transition cursor-pointer"
                >
                  {editingDept ? 'Update Department' : 'Save Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: CONFIRM DELETE BRANCH
         ==================================================================== */}
      {branchToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Facility</h3>
                <p className="text-[11px] text-slate-400">Irreversible infrastructure action</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to delete operating branch <strong className="text-white">"{branchToDelete.name}"</strong> ({branchToDelete.code})?
            </p>

            {deleteBranchError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteBranchError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBranchToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingBranch}
                onClick={handleConfirmDeleteBranch}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition flex items-center gap-2 cursor-pointer"
              >
                {isDeletingBranch ? 'Deleting...' : 'Confirm & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: CONFIRM DELETE DEPARTMENT
         ==================================================================== */}
      {deptToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Department</h3>
                <p className="text-[11px] text-slate-400">Cost center removal</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to delete department <strong className="text-white">"{deptToDelete.name}"</strong>?
            </p>

            {deleteDeptError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteDeptError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeptToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingDept}
                onClick={handleConfirmDeleteDept}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition flex items-center gap-2 cursor-pointer"
              >
                {isDeletingDept ? 'Deleting...' : 'Confirm & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
