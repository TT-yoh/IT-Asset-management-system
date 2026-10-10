import React from 'react';
import { Branch, AssetCategory, User } from '../types';
import { Search, Filter, X, Building2, Tag, CheckSquare, RefreshCw } from 'lucide-react';

interface AssetFilterProps {
  branches: Branch[];
  categories: AssetCategory[];
  currentUser: User;
  selectedBranch: string;
  onBranchChange: (branchId: string) => void;
  selectedCategory: string;
  onCategoryChange: (catId: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedCondition: string;
  onConditionChange: (cond: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onResetFilters: () => void;
}

export const AssetFilter: React.FC<AssetFilterProps> = ({
  branches,
  categories,
  currentUser,
  selectedBranch,
  onBranchChange,
  selectedCategory,
  onCategoryChange,
  selectedStatus,
  onStatusChange,
  selectedCondition,
  onConditionChange,
  searchQuery,
  onSearchChange,
  onResetFilters
}) => {
  const isBranchRestricted = currentUser.role === 'BRANCH_MANAGER' || currentUser.role === 'USER';

  const activeCount = [
    selectedBranch !== 'ALL' ? 1 : 0,
    selectedCategory !== 'ALL' ? 1 : 0,
    selectedStatus !== 'ALL' ? 1 : 0,
    selectedCondition !== 'ALL' ? 1 : 0,
    (searchQuery || '').trim() !== '' ? 1 : 0
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-xl space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, asset code, serial #, or model..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Stats & Reset */}
        <div className="flex items-center gap-3 justify-end">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            <span>Active Filters:</span>
            <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              {activeCount}
            </span>
          </div>

          {activeCount > 0 && (
            <button
              onClick={onResetFilters}
              className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Row Dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80 text-xs">
        {/* Branch Filter */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
            <Building2 className="w-3 h-3 text-emerald-400" />
            <span>Branch Location</span>
          </label>
          <select
            value={selectedBranch}
            disabled={isBranchRestricted}
            onChange={(e) => onBranchChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
          >
            <option value="ALL">All Branches ({branches.length})</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
            <Tag className="w-3 h-3 text-sky-400" />
            <span>Hardware Category</span>
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Categories ({categories.length})</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
            <CheckSquare className="w-3 h-3 text-emerald-400" />
            <span>Life-Cycle Status</span>
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
          >
            <option value="ALL">ALL STATUSES</option>
            <option value="ACTIVE">ACTIVE (In Production)</option>
            <option value="NON_WORKING">NON-WORKING (Offline/Repair/Damaged)</option>
            <option value="REPAIR">REPAIR (Maintenance)</option>
            <option value="DAMAGED">DAMAGED (Flagged)</option>
            <option value="DEPRECATED">DEPRECATED (Decommissioned)</option>
            <option value="SOLD">SOLD / DISPOSED</option>
          </select>
        </div>

        {/* Condition Filter */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Physical Condition
          </label>
          <select
            value={selectedCondition}
            onChange={(e) => onConditionChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">Any Condition</option>
            <option value="NEW">NEW (Pristine / Unassigned)</option>
            <option value="GOOD">GOOD (Normal Wear)</option>
            <option value="FAIR">FAIR (Needs Servicing)</option>
            <option value="POOR">POOR (Damaged)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
