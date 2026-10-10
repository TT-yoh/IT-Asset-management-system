import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, Filter, Layers, CheckCircle, AlertTriangle, 
  HelpCircle, ShieldCheck, DollarSign, ListFilter, Trash2
} from 'lucide-react';
import { INITIAL_ASSETS, MINEAZY_BRANCHES, CATEGORIES } from '../../../mockData';
import { ReportExport } from '../../../components/ReportExport';

interface ReportsInventoryProps {
  onBack: () => void;
  assets?: typeof INITIAL_ASSETS;
}

export default function ReportsInventoryPage({
  onBack,
  assets = INITIAL_ASSETS
}: ReportsInventoryProps) {
  // Filters
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCondition, setSelectedCondition] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedBranch('ALL');
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
    setSelectedCondition('ALL');
    setSearchQuery('');
  };

  // Filtered Assets list
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchBranch = selectedBranch === 'ALL' || asset.branchId === selectedBranch;
      const matchCategory = selectedCategory === 'ALL' || asset.categoryId === selectedCategory;
      const matchStatus = selectedStatus === 'ALL' || asset.status === selectedStatus;
      const matchCondition = selectedCondition === 'ALL' || asset.condition === selectedCondition;
      
      const matchSearch = searchQuery === '' || 
        asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.assetCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (asset.model && asset.model.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (asset.serialNumber && asset.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchBranch && matchCategory && matchStatus && matchCondition && matchSearch;
    });
  }, [selectedBranch, selectedCategory, selectedStatus, selectedCondition, searchQuery, assets]);

  // Calculate subtotals and grouping by category
  const categorySubtotals = useMemo(() => {
    const subtotals: Record<string, { count: number; totalCost: number; currentValue: number }> = {};
    
    filteredAssets.forEach(asset => {
      const cat = asset.categoryName || 'Unassigned';
      if (!subtotals[cat]) {
        subtotals[cat] = { count: 0, totalCost: 0, currentValue: 0 };
      }
      subtotals[cat].count += 1;
      subtotals[cat].totalCost += asset.purchaseCost || 0;
      subtotals[cat].currentValue += asset.currentValue || asset.purchaseCost || 0;
    });

    return Object.entries(subtotals).map(([name, data]) => ({
      category: name,
      ...data
    }));
  }, [filteredAssets]);

  // Grand totals
  const grandTotals = useMemo(() => {
    return filteredAssets.reduce(
      (totals, asset) => {
        totals.count += 1;
        totals.cost += asset.purchaseCost || 0;
        totals.value += asset.currentValue || asset.purchaseCost || 0;
        return totals;
      },
      { count: 0, cost: 0, value: 0 }
    );
  }, [filteredAssets]);

  // Prepare data format for Excel/PDF/CSV exports
  const exportData = useMemo(() => {
    return filteredAssets.map(a => ({
      'Asset Code': a.assetCode,
      'Asset Name': a.name,
      'Model': a.model || 'N/A',
      'Serial Number': a.serialNumber || 'N/A',
      'Category': a.categoryName,
      'Branch': a.branchName,
      'Status': a.status,
      'Condition': a.condition,
      'Purchase Date': a.purchaseDate,
      'Purchase Price': `$${(a.purchaseCost || 0).toLocaleString()}`,
      'Current Value': `$${(a.currentValue || a.purchaseCost || 0).toLocaleString()}`,
      'Assigned Custody': a.assignedToUserName || 'Decommissioned/Warehouse'
    }));
  }, [filteredAssets]);

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Directory</span>
        </button>

        <h1 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Asset Inventory Ledger Report</span>
        </h1>
      </div>

      {/* Filter Card */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4 shadow-md">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center">
            <Filter className="w-4 h-4 text-indigo-400 mr-1.5" />
            Query Filters & Search parameters
          </h2>
          <button
            onClick={handleResetFilters}
            className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            <span>Reset Filters</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
          {/* Search bar */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-slate-500">
              Text Search (Code, Name, Model)
            </label>
            <input
              type="text"
              placeholder="Type to filter ledger..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 text-slate-200 text-xs font-medium border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2.5 placeholder-slate-600"
            />
          </div>

          {/* Branch filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500">
              Branch Division
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-slate-950 text-slate-300 text-xs font-medium border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2.5"
            >
              <option value="ALL">All Branches</option>
              {MINEAZY_BRANCHES.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500">
              Device Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-950 text-slate-300 text-xs font-medium border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2.5"
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Condition filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500">
              Hardware Condition
            </label>
            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="w-full bg-slate-950 text-slate-300 text-xs font-medium border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2.5"
            >
              <option value="ALL">All Conditions</option>
              <option value="EXCELLENT">Excellent</option>
              <option value="GOOD">Good</option>
              <option value="FAIR">Fair</option>
              <option value="POOR">Poor</option>
            </select>
          </div>
        </div>
      </div>

      {/* Export Toolbar */}
      <ReportExport 
        data={exportData} 
        filename="Asset_Inventory_Audit_Report" 
        title="ASSET INVENTORY AUDIT LEDGER" 
      />

      {/* Main Table View */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden shadow-xl">
        <div className="px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Asset Records Registry List ({filteredAssets.length} matching)
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Calculated subtotals synced via browser state
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-slate-300 text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 font-bold">
                <th className="p-3.5">Code</th>
                <th className="p-3.5">Asset Name</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Branch</th>
                <th className="p-3.5">Condition</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Cost</th>
                <th className="p-3.5 text-right">Current Value</th>
                <th className="p-3.5">Assigned Custody</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredAssets.length > 0 ? (
                filteredAssets.map(asset => {
                  let condColor = 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20';
                  if (asset.condition === 'GOOD') condColor = 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20';
                  if (asset.condition === 'FAIR') condColor = 'text-amber-400 bg-amber-400/10 border-amber-500/20';
                  if (asset.condition === 'POOR') condColor = 'text-rose-400 bg-rose-400/10 border-rose-500/20';

                  let statColor = 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25';
                  if (asset.status === 'REPAIR') statColor = 'text-rose-400 bg-rose-500/10 border-rose-500/25';
                  if (asset.status === 'DISPOSED') statColor = 'text-slate-400 bg-slate-500/10 border-slate-500/25';

                  return (
                    <tr key={asset.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3.5 font-mono text-emerald-400 font-bold">{asset.assetCode}</td>
                      <td className="p-3.5 font-bold text-slate-100">
                        <div>{asset.name}</div>
                        {asset.model && <div className="text-[10px] text-slate-500 font-normal">{asset.model}</div>}
                      </td>
                      <td className="p-3.5 text-slate-300 font-medium">{asset.categoryName}</td>
                      <td className="p-3.5 text-slate-400 text-[11px] leading-tight font-medium">{asset.branchName}</td>
                      <td className="p-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${condColor}`}>
                          {asset.condition}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statColor}`}>
                          {asset.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-300">${(asset.purchaseCost || 0).toLocaleString()}</td>
                      <td className="p-3.5 text-right font-mono text-emerald-300 font-bold">${(asset.currentValue || asset.purchaseCost || 0).toLocaleString()}</td>
                      <td className="p-3.5 text-slate-400">{asset.assignedToUserName || <span className="text-slate-600 font-normal italic">In Storage</span>}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-semibold">
                    No physical asset records match your filtered queries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Subtotals Section */}
      {categorySubtotals.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3.5">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center">
            <ListFilter className="w-4 h-4 text-emerald-400 mr-1.5" />
            Operational Subtotals grouped by Category
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {categorySubtotals.map((sub, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-950/60 border border-slate-900 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-400 truncate uppercase tracking-tight">
                  {sub.category}
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-slate-500 text-[10px]">Units: {sub.count}</span>
                  <span className="text-xs font-mono font-bold text-emerald-300">
                    ${sub.currentValue.toLocaleString()}
                  </span>
                </div>
                {/* Horizontal simple progress */}
                <div className="w-full bg-slate-850 h-1 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full" 
                    style={{ width: `${Math.min(100, (sub.currentValue / Math.max(1, grandTotals.value)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Grand Totals */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-slate-950 to-emerald-950 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <span className="text-xs font-bold text-slate-300 uppercase">
              Grand Total Calculated Ledger
            </span>
            <div className="flex gap-6">
              <div className="space-y-0.5">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Total Checked Units</div>
                <div className="text-sm font-bold text-slate-200">{grandTotals.count} items</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Combined Capital Cost</div>
                <div className="text-sm font-bold text-slate-200">${grandTotals.cost.toLocaleString()}</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] text-emerald-500 font-bold uppercase">Aggregate Book Value</div>
                <div className="text-sm font-bold text-emerald-300">${grandTotals.value.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
