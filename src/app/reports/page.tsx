import React from 'react';
import { 
  BarChart3, 
  Layers, 
  TrendingDown, 
  Wrench, 
  PieChart, 
  Clock, 
  ShieldCheck, 
  ArrowLeftRight, 
  ArrowRight,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Activity,
  Zap
} from 'lucide-react';
import { INITIAL_ASSETS } from '../../mockData';
import { exportToExcel, exportToPDF } from '../../lib/report-service';

interface ReportsLandingProps {
  onSelectReport: (reportId: string) => void;
  assets?: typeof INITIAL_ASSETS;
}

export default function ReportsLandingPage({
  onSelectReport,
  assets = INITIAL_ASSETS
}: ReportsLandingProps) {
  const reportCards = [
    {
      id: 'tiflash',
      title: 'TiFlash HTAP Real-Time Analytics',
      desc: 'Sub-second columnar query execution: multi-branch depreciation rollups, live CBO optimizer plan, and zero OLTP lock contention.',
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      color: 'from-amber-500/15 via-slate-900 to-emerald-500/10 border-amber-500/40 text-amber-300',
      badge: 'TiDB Cloud HTAP'
    },
    {
      id: 'dashboard',
      title: 'Dashboard Overview',
      desc: 'High-level KPIs, branch asset counts, category spreads, status breakdown, and overall health charts.',
      icon: <BarChart3 className="w-5 h-5 text-emerald-400" />,
      color: 'from-emerald-500/10 to-emerald-500/10 border-emerald-500/20 text-emerald-300',
      badge: 'Interactive'
    },
    {
      id: 'inventory',
      title: 'Asset Inventory',
      desc: 'Granular tabular directory of physical assets with full filtering, category totals, and status markers.',
      icon: <Layers className="w-5 h-5 text-indigo-400" />,
      color: 'from-indigo-500/10 to-purple-500/10 border-indigo-500/20 text-indigo-300',
      badge: 'Full Filtering'
    },
    {
      id: 'depreciation',
      title: 'Depreciation Analysis',
      desc: 'Calculate annual depreciation, accumulated depreciation, book value projections, STRAIGHT_LINE vs DDB.',
      icon: <TrendingDown className="w-5 h-5 text-rose-400" />,
      color: 'from-rose-500/10 to-orange-500/10 border-rose-500/20 text-rose-300',
      badge: 'Valuation'
    },
    {
      id: 'maintenance',
      title: 'Maintenance Cost Analysis',
      desc: 'Inspect preventive vs reactive costs, average repair timelines, technician billables, and seasonal cost forecasting.',
      icon: <Wrench className="w-5 h-5 text-amber-400" />,
      color: 'from-amber-500/10 to-yellow-500/10 border-amber-500/20 text-amber-300',
      badge: 'Forecasting'
    },
    {
      id: 'budget',
      title: 'Budget Tracking',
      desc: 'Evaluate fiscal allocations, category-wise burn rate percentages, remaining balances, and alert status.',
      icon: <PieChart className="w-5 h-5 text-cyan-400" />,
      color: 'from-cyan-500/10 to-blue-500/10 border-cyan-500/20 text-cyan-300',
      badge: 'Utilization'
    },
    {
      id: 'age',
      title: 'Asset Age & Condition',
      desc: 'Sort assets into operational age brackets, view replacements advice, and track hardware end-of-life limits.',
      icon: <Clock className="w-5 h-5 text-emerald-400" />,
      color: 'from-emerald-500/10 to-emerald-500/10 border-emerald-500/20 text-emerald-300',
      badge: 'Recommendations'
    },
    {
      id: 'warranty',
      title: 'Warranty Tracking',
      desc: 'Count warranty expiries, identify active coverage assets, and plan renewals for business-critical gear.',
      icon: <ShieldCheck className="w-5 h-5 text-violet-400" />,
      color: 'from-violet-500/10 to-fuchsia-500/10 border-violet-500/20 text-violet-300',
      badge: 'Compliance'
    },
    {
      id: 'checkout',
      title: 'Checkout History',
      desc: 'Audited log of custody handovers, average assignment periods, and user responsibility records.',
      icon: <ArrowLeftRight className="w-5 h-5 text-pink-400" />,
      color: 'from-pink-500/10 to-rose-500/10 border-pink-500/20 text-pink-300',
      badge: 'Audit Log'
    }
  ];

  const handleQuickExport = (type: 'EXCEL' | 'PDF') => {
    const simplified = assets.map(a => ({
      Asset_Code: a.assetCode,
      Name: a.name,
      Category: a.categoryName,
      Branch: a.branchName,
      Status: a.status,
      Cost: a.purchaseCost,
      Current_Value: a.currentValue,
      Purchase_Date: a.purchaseDate
    }));

    if (type === 'EXCEL') {
      exportToExcel(simplified, 'Asset_Master_Quick_Export');
    } else {
      exportToPDF(simplified, 'Asset_Master_Quick_Export', 'ASSET MASTER QUICK EXPORT');
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 border border-slate-800/80 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl -z-10" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-1 rounded-full w-fit">
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span>Phase 6: Reporting System Active</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-2.5">
              Reports & Advanced Analytics
            </h1>
            <p className="text-slate-400 text-xs mt-1.5 max-w-xl leading-relaxed">
              Fully modularized reporting engines integrated with TiDB Cloud HTAP & TiFlash columnar acceleration. Generate rich visual trend graphs, depreciation models, and exports.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleQuickExport('EXCEL')}
              className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Quick Excel</span>
            </button>
            <button
              onClick={() => handleQuickExport('PDF')}
              className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Quick PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Reports Directory Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {reportCards.map(card => (
          <div
            key={card.id}
            onClick={() => onSelectReport(card.id)}
            className={`group rounded-2xl bg-gradient-to-b ${card.color} p-5 border hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-950/10 transition-all cursor-pointer flex flex-col justify-between`}
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 group-hover:border-emerald-500/30 transition-all">
                  {card.icon}
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-950/40 text-slate-400 border border-slate-800">
                  {card.badge}
                </span>
              </div>

              <h2 className="text-sm font-bold text-slate-200 mt-4 group-hover:text-emerald-300 transition-colors">
                {card.title}
              </h2>
              <p className="text-slate-400 text-[11px] leading-relaxed mt-2">
                {card.desc}
              </p>
            </div>

            <div className="flex items-center text-emerald-400 text-xs font-bold mt-5 group-hover:translate-x-1 transition-transform">
              <span>View Report</span>
              <ArrowRight className="w-3 h-3 ml-1.5" />
            </div>
          </div>
        ))}
      </div>

      {/* TiDB Cloud connection status footer */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/40 border border-slate-900">
        <div className="flex items-center space-x-2.5">
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-400">
            TiDB Cloud Serverless Engine:
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Port 4000 Distributed SQL + TiFlash Columnar Analytics
          </span>
        </div>
        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Sync Online
        </span>
      </div>
    </div>
  );
}
