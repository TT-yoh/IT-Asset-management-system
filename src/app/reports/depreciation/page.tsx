import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, Filter, TrendingDown, BookOpen, RefreshCw, 
  HelpCircle, DollarSign, Calendar, ChevronDown, ChevronRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { INITIAL_ASSETS, MINEAZY_BRANCHES } from '../../../mockData';
import { calculateDepreciation } from '../../../lib/report-service';
import { ReportExport } from '../../../components/ReportExport';

interface ReportsDepreciationProps {
  onBack: () => void;
  assets?: typeof INITIAL_ASSETS;
}

export default function ReportsDepreciationPage({
  onBack,
  assets = INITIAL_ASSETS
}: ReportsDepreciationProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [deprMethod, setDeprMethod] = useState<'STRAIGHT_LINE' | 'DOUBLE_DECLINING'>('STRAIGHT_LINE');
  const [fiscalYear, setFiscalYear] = useState<string>('2026');

  // Toggle for category groups
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Heavy Mining Machinery': true,
    'IT Servers & Infrastructure': true
  });

  const toggleCategory = (catName: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catName]: !prev[catName]
    }));
  };

  // 1. Calculate assets matching filters and run depreciation models
  const reportData = useMemo(() => {
    const filtered = assets.filter(a => selectedBranch === 'ALL' || a.branchId === selectedBranch);

    let totalPurchaseValue = 0;
    let totalAccumulated = 0;
    let totalBookValue = 0;
    let combinedAge = 0;

    const currentYear = parseInt(fiscalYear);

    // Group items by category
    const categoryGroups: Record<string, any[]> = {};

    filtered.forEach(asset => {
      const calc = calculateDepreciation(asset, deprMethod, 5, 0.1);
      totalPurchaseValue += asset.purchaseCost;
      totalAccumulated += calc.accumulatedDepreciation;
      totalBookValue += calc.bookValue;

      const pYear = new Date(asset.purchaseDate).getFullYear();
      const age = Math.max(0, currentYear - pYear);
      combinedAge += age;

      const cat = asset.categoryName || 'General';
      if (!categoryGroups[cat]) {
        categoryGroups[cat] = [];
      }

      categoryGroups[cat].push({
        ...asset,
        calculated: calc,
        ageYears: age
      });
    });

    const averageAge = filtered.length > 0 ? parseFloat((combinedAge / filtered.length).toFixed(1)) : 2.5;

    // Build trend chart data
    const trendChart = [];
    for (let yrOffset = 0; yrOffset < 5; yrOffset++) {
      let cumulativeBookValue = 0;
      let cumulativeDepreciation = 0;

      filtered.forEach(asset => {
        // Run projection
        const pYear = new Date(asset.purchaseDate).getFullYear();
        const futureAge = Math.max(0, (currentYear - pYear) + yrOffset);
        
        // Simulating Straight line vs Double declining trend projection
        let depAccum = 0;
        const cost = asset.purchaseCost;
        const salvage = cost * 0.1;

        if (deprMethod === 'STRAIGHT_LINE') {
          const annual = (cost - salvage) / 5;
          depAccum = Math.min(cost - salvage, annual * futureAge);
        } else {
          const rate = 2 / 5;
          let tempVal = cost;
          for (let k = 0; k < futureAge; k++) {
            const depAmt = tempVal * rate;
            if (tempVal - depAmt < salvage) {
              depAccum += (tempVal - salvage);
              tempVal = salvage;
              break;
            } else {
              depAccum += depAmt;
              tempVal -= depAmt;
            }
          }
        }

        cumulativeBookValue += Math.max(salvage, cost - depAccum);
        cumulativeDepreciation += depAccum;
      });

      trendChart.push({
        year: String(currentYear + yrOffset),
        'Book Value': Math.round(cumulativeBookValue),
        'Accumulated Depreciation': Math.round(cumulativeDepreciation)
      });
    }

    return {
      totalPurchaseValue,
      totalAccumulated,
      totalBookValue,
      averageAge,
      categoryGroups,
      trendChart,
      totalCount: filtered.length
    };
  }, [selectedBranch, deprMethod, fiscalYear, assets]);

  // Format flattened rows for file exports
  const exportData = useMemo(() => {
    const rows: any[] = [];
    const groups = reportData.categoryGroups as Record<string, any[]>;
    Object.entries(groups).forEach(([catName, items]) => {
      items.forEach(item => {
        rows.push({
          'Asset Code': item.assetCode,
          'Asset Name': item.name,
          'Category': catName,
          'Purchase Date': item.purchaseDate,
          'Age (Years)': item.ageYears,
          'Purchase Cost': `$${(item.purchaseCost || 0).toLocaleString()}`,
          'Annual Depreciation': `$${(item.calculated.annualDepreciation || 0).toLocaleString()}`,
          'Accumulated Depr.': `$${(item.calculated.accumulatedDepreciation || 0).toLocaleString()}`,
          'Book Value (Fiscal)': `$${(item.calculated.bookValue || 0).toLocaleString()}`
        });
      });
    });
    return rows;
  }, [reportData]);

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Directory</span>
        </button>

        <h1 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <TrendingDown className="w-4 h-4 text-rose-400" />
          <span>Capital Assets Depreciation Ledger</span>
        </h1>
      </div>

      {/* Settings filter block */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4 shadow-md">
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center">
          <Calendar className="w-4 h-4 text-rose-400 mr-1.5" />
          Depreciation Parameters
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Branch */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500">Branch Location</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-slate-950 text-slate-300 text-xs font-medium border border-slate-800 focus:border-rose-500 focus:outline-none rounded-xl px-3 py-2.5"
            >
              <option value="ALL">All Branches</option>
              {MINEAZY_BRANCHES.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Model Method */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500">Depreciation Model Formula</label>
            <select
              value={deprMethod}
              onChange={(e) => setDeprMethod(e.target.value as any)}
              className="w-full bg-slate-950 text-slate-300 text-xs font-medium border border-slate-800 focus:border-rose-500 focus:outline-none rounded-xl px-3 py-2.5"
            >
              <option value="STRAIGHT_LINE">Straight-Line Method (15% p.a.)</option>
              <option value="DOUBLE_DECLINING">Double Declining Balance Method (DDB 40%)</option>
            </select>
          </div>

          {/* Fiscal Year */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500">Fiscal Calculation Year</label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
              className="w-full bg-slate-950 text-slate-300 text-xs font-medium border border-slate-800 focus:border-rose-500 focus:outline-none rounded-xl px-3 py-2.5"
            >
              <option value="2026">FY 2026 (Current)</option>
              <option value="2027">FY 2027 (Forecast)</option>
              <option value="2028">FY 2028 (Forecast)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Export component */}
      <ReportExport 
        data={exportData} 
        filename={`Asset_Depreciation_Report_${fiscalYear}`} 
        title={`ASSET DEPRECIATION ANALYSIS - FY ${fiscalYear}`} 
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Total Book Entry Price</span>
          <span className="text-base font-bold text-slate-100 font-mono mt-1">
            ${reportData.totalPurchaseValue.toLocaleString()}
          </span>
          <span className="text-[9px] text-slate-500 mt-1">Historical capital expense</span>
        </div>

        {/* Card 2 */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Accumulated Depreciation</span>
          <span className="text-base font-bold text-rose-400 font-mono mt-1">
            -${reportData.totalAccumulated.toLocaleString()}
          </span>
          <span className="text-[9px] text-rose-500/80 mt-1">Devalued lifetime wear</span>
        </div>

        {/* Card 3 */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-emerald-950/20 border border-emerald-500/20 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tight">Current Asset Net Book Value</span>
          <span className="text-base font-bold text-emerald-300 font-mono mt-1">
            ${reportData.totalBookValue.toLocaleString()}
          </span>
          <span className="text-[9px] text-emerald-500 mt-1">Combined balance-sheet value</span>
        </div>

        {/* Card 4 */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Average Asset Age</span>
          <span className="text-base font-bold text-indigo-300 mt-1">
            {reportData.averageAge} years
          </span>
          <span className="text-[9px] text-indigo-500 mt-1">Avg since registration</span>
        </div>
      </div>

      {/* Projection Trend Graph */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center">
          <TrendingDown className="w-4 h-4 text-emerald-400 mr-2" />
          Projected Capital Depreciation Trend (5-Year Forecast Window)
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={reportData.trendChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="year" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
              />
              <Legend verticalAlign="top" height={36} />
              <Line type="monotone" dataKey="Book Value" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Accumulated Depreciation" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grouped Details Table */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center">
          <BookOpen className="w-4 h-4 text-rose-400 mr-1.5" />
          Ledger breakdowns grouped by Category ({Object.keys(reportData.categoryGroups as Record<string, any[]>).length} Groups)
        </h3>

        {Object.entries(reportData.categoryGroups as Record<string, any[]>).map(([catName, items]) => {
          const isExpanded = expandedCategories[catName] ?? false;
          
          // Calculate category totals
          const catPurchaseTotal = items.reduce((sum, item) => sum + item.purchaseCost, 0);
          const catBookTotal = items.reduce((sum, item) => sum + item.calculated.bookValue, 0);
          const catDepTotal = items.reduce((sum, item) => sum + item.calculated.accumulatedDepreciation, 0);

          return (
            <div key={catName} className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden shadow-md">
              {/* Category Header */}
              <div 
                onClick={() => toggleCategory(catName)}
                className="p-4 bg-slate-900/60 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors"
              >
                <div className="flex items-center space-x-2.5">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                    {catName} ({items.length} assets)
                  </span>
                </div>

                <div className="flex items-center space-x-6 text-[11px] font-mono font-bold text-slate-400">
                  <div>Cost: <span className="text-slate-100">${catPurchaseTotal.toLocaleString()}</span></div>
                  <div>Accum Depr: <span className="text-rose-400">-${catDepTotal.toLocaleString()}</span></div>
                  <div>Book Value: <span className="text-emerald-400">${catBookTotal.toLocaleString()}</span></div>
                </div>
              </div>

              {/* Category Items list */}
              {isExpanded && (
                <div className="overflow-x-auto border-t border-slate-850">
                  <table className="w-full text-left text-slate-300 text-xs">
                    <thead>
                      <tr className="bg-slate-950/80 border-b border-slate-900 text-slate-500 font-bold">
                        <th className="p-3">Asset Code</th>
                        <th className="p-3">Asset Name</th>
                        <th className="p-3">Purchase Date</th>
                        <th className="p-3 text-right">Age (Yrs)</th>
                        <th className="p-3 text-right">Purchase Cost</th>
                        <th className="p-3 text-right">Annual Depr.</th>
                        <th className="p-3 text-right">Accumulated</th>
                        <th className="p-3 text-right">Book Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {items.map(item => (
                        <tr key={item.id} className="hover:bg-slate-900/20 transition-colors">
                          <td className="p-3 font-mono text-emerald-400 font-bold">{item.assetCode}</td>
                          <td className="p-3 text-slate-200 font-medium">{item.name}</td>
                          <td className="p-3 text-slate-400">{item.purchaseDate}</td>
                          <td className="p-3 text-right text-slate-300">{item.ageYears}</td>
                          <td className="p-3 text-right font-mono text-slate-300">${item.purchaseCost.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-rose-400/80">${item.calculated.annualDepreciation.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-rose-400">-${item.calculated.accumulatedDepreciation.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-emerald-300 font-bold">${item.calculated.bookValue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
