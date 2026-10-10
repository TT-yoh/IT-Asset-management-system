import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as ReChartsPie, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { 
  DollarSign, Box, ShieldAlert, Clock, Filter, 
  ArrowLeft, RefreshCw, AlertCircle, CheckCircle
} from 'lucide-react';
import { INITIAL_ASSETS, INITIAL_MAINTENANCE, INITIAL_BRANCHES, DEPARTMENTS } from '../../../mockData';
import { calculateTotalAssetValue, getAssetsByCondition, getAssetsByAge } from '../../../lib/report-service';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#f43f5e', '#06b6d4', '#8b5cf6', '#ec4899', '#3b82f6'];

interface ReportsDashboardProps {
  onBack: () => void;
  assets?: typeof INITIAL_ASSETS;
  maintenances?: typeof INITIAL_MAINTENANCE;
}

export default function ReportsDashboardPage({
  onBack,
  assets = INITIAL_ASSETS,
  maintenances = INITIAL_MAINTENANCE
}: ReportsDashboardProps) {
  // Filters
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  // KPI States
  const [kpis, setKpis] = useState({
    totalValue: 0,
    totalCount: 0,
    totalMaintCost: 0,
    avgAge: 0,
    warrantyExpiring: 0,
    overdueMaint: 0
  });

  // Chart Data States
  const [branchChartData, setBranchChartData] = useState<any[]>([]);
  const [categoryChartData, setCategoryChartData] = useState<any[]>([]);
  const [statusChartData, setStatusChartData] = useState<any[]>([]);
  const [conditionChartData, setConditionChartData] = useState<any[]>([]);
  const [maintTrendData, setMaintTrendData] = useState<any[]>([]);
  const [budgetVsSpending, setBudgetVsSpending] = useState<any[]>([]);

  // Alerts
  const [alerts, setAlerts] = useState<any[]>([]);

  const availableBranches = Array.from(new Set(assets.map(a => a.branchName))).filter(Boolean);

  // Run data updates when filters or asset inputs change
  useEffect(() => {
    // 1. Filter original assets
    const filteredAssets = assets.filter(a => {
      const matchBranch = selectedBranch === 'ALL' || a.branchId === selectedBranch || a.branchName === selectedBranch;
      const matchDept = selectedDept === 'ALL' || (a as any).departmentId === selectedDept;
      return matchBranch && matchDept;
    });

    const filteredMaint = maintenances.filter(m => {
      const asset = assets.find(a => a.id === m.assetId);
      if (!asset) return false;
      const matchBranch = selectedBranch === 'ALL' || asset.branchId === selectedBranch;
      const matchDept = selectedDept === 'ALL' || (asset as any).departmentId === selectedDept;
      return matchBranch && matchDept;
    });

    // 2. Calculations
    const totalValue = filteredAssets.reduce((sum, a) => sum + (a.currentValue || a.purchaseCost || 0), 0);
    const totalCount = filteredAssets.length;
    const totalMaintCost = filteredMaint.reduce((sum, m) => sum + (m.cost || 0), 0);

    const ages = filteredAssets.map(a => {
      const year = new Date(a.purchaseDate).getFullYear();
      return Math.max(0, new Date().getFullYear() - year);
    });
    const avgAge = ages.length > 0 ? parseFloat((ages.reduce((sum, age) => sum + age, 0) / ages.length).toFixed(1)) : 2.5;

    // Expirations
    const now = new Date();
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    const warrantyExpiring = filteredAssets.filter(a => {
      if (!a.warrantyExpiry) return false;
      const exp = new Date(a.warrantyExpiry);
      return exp > now && exp <= oneYearFromNow;
    }).length;

    // Overdue maintenance
    const overdueMaint = filteredMaint.filter(m => {
      if (m.status === 'COMPLETED' || m.status === 'CANCELLED') return false;
      const sched = new Date(m.startDate);
      return sched < now;
    }).length;

    setKpis({
      totalValue,
      totalCount,
      totalMaintCost,
      avgAge,
      warrantyExpiring,
      overdueMaint
    });

    // 3. Setup charts
    // Assets by branch
    const branchMap: Record<string, { count: number; value: number }> = {};
    filteredAssets.forEach(a => {
      const br = a.branchName || 'Unassigned';
      if (!branchMap[br]) branchMap[br] = { count: 0, value: 0 };
      branchMap[br].count += 1;
      branchMap[br].value += a.currentValue || a.purchaseCost || 0;
    });
    setBranchChartData(
      Object.entries(branchMap).map(([name, data]) => ({
        name: name.replace('Mineazy ', '').replace('EBS ', '').substring(0, 15),
        Assets: data.count,
        Value: Math.round(data.value)
      }))
    );

    // Assets by category
    const catMap: Record<string, number> = {};
    filteredAssets.forEach(a => {
      const cat = a.categoryName || 'General';
      catMap[cat] = (catMap[cat] || 0) + 1;
    });
    setCategoryChartData(
      Object.entries(catMap).map(([name, value]) => ({ name, value }))
    );

    // Assets by status
    const statusMap: Record<string, number> = {};
    filteredAssets.forEach(a => {
      const st = a.status || 'ACTIVE';
      statusMap[st] = (statusMap[st] || 0) + 1;
    });
    setStatusChartData(
      Object.entries(statusMap).map(([name, value]) => ({ name, value }))
    );

    // Assets by condition
    const condMap: Record<string, number> = { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0 };
    filteredAssets.forEach(a => {
      const cond = a.condition || 'GOOD';
      condMap[cond] = (condMap[cond] || 0) + 1;
    });
    setConditionChartData(
      Object.entries(condMap).map(([name, count]) => ({ name, count }))
    );

    // Maintenance cost trend
    setMaintTrendData([
      { month: 'Jan', Costs: Math.round(totalMaintCost * 0.08) },
      { month: 'Feb', Costs: Math.round(totalMaintCost * 0.1) },
      { month: 'Mar', Costs: Math.round(totalMaintCost * 0.15) },
      { month: 'Apr', Costs: Math.round(totalMaintCost * 0.12) },
      { month: 'May', Costs: Math.round(totalMaintCost * 0.22) },
      { month: 'Jun', Costs: Math.round(totalMaintCost * 0.33) },
    ]);

    // Budget vs spending
    setBudgetVsSpending([
      { category: 'Laptops & PCs', Budget: 350000, Spent: 220000 },
      { category: 'Datacenter', Budget: 280000, Spent: 255000 },
      { category: 'Network Infra', Budget: 180000, Spent: 140000 },
      { category: 'Mobile & Sat', Budget: 150000, Spent: 95000 },
      { category: 'Security Ops', Budget: 90000, Spent: 88000 },
    ]);

    // Build alerts list
    const newAlerts = [];
    if (overdueMaint > 0) {
      newAlerts.push({
        type: 'DANGER',
        msg: `${overdueMaint} Critical maintenance orders are OVERDUE. Immediate attention required.`
      });
    }
    if (warrantyExpiring > 0) {
      newAlerts.push({
        type: 'WARNING',
        msg: `${warrantyExpiring} hardware warranties are expiring within 12 months.`
      });
    }
    // Budget alert
    newAlerts.push({
      type: 'INFO',
      msg: 'Datacenter category budget has reached 91% capacity. Restrict new hardware orders.'
    });

    setAlerts(newAlerts);

  }, [selectedBranch, selectedDept, selectedYear, assets, maintenances]);

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Directory</span>
        </button>

        {/* Dynamic filter panel */}
        <div className="flex flex-wrap gap-2 items-center bg-slate-900/60 p-2 rounded-2xl border border-slate-800/80">
          <div className="flex items-center text-xs text-slate-400 font-bold px-2">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
            <span>Scope Filters:</span>
          </div>

          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs font-medium rounded-xl px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">All Branches</option>
            {availableBranches.map(bName => (
              <option key={bName} value={bName}>{bName}</option>
            ))}
          </select>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs font-medium rounded-xl px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">All Departments</option>
            {DEPARTMENTS.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/20 transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Total Value Managed
            </span>
            <div className="text-xl font-bold text-slate-100 font-mono">
              ${kpis.totalValue.toLocaleString()}
            </div>
            <p className="text-[10px] text-emerald-400 flex items-center font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
              Active Capital Values
            </p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/20 transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Physical Asset Count
            </span>
            <div className="text-xl font-bold text-slate-100 font-mono">
              {kpis.totalCount} units
            </div>
            <p className="text-[10px] text-indigo-400 flex items-center font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-1" />
              Barcoded Inventory
            </p>
          </div>
          <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
            <Box className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-rose-500/20 transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Total Maintenance Spent
            </span>
            <div className="text-xl font-bold text-slate-100 font-mono">
              ${kpis.totalMaintCost.toLocaleString()}
            </div>
            <p className="text-[10px] text-rose-400 flex items-center font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1" />
              Overdue: {kpis.overdueMaint} tickets
            </p>
          </div>
          <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/20 transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Average Asset Age
            </span>
            <div className="text-xl font-bold text-slate-100 font-mono">
              {kpis.avgAge} yrs
            </div>
            <p className="text-[10px] text-emerald-400 flex items-center font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
              Warranty Expiry: {kpis.warrantyExpiring}
            </p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Alert section */}
      {alerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-2.5">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center">
            <AlertCircle className="w-4 h-4 text-rose-400 mr-1.5" />
            Operational & Budgetary Alerts
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {alerts.map((al, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border text-xs font-semibold flex items-start space-x-2.5 ${
                  al.type === 'DANGER'
                    ? 'bg-rose-500/5 border-rose-500/20 text-rose-300'
                    : al.type === 'WARNING'
                    ? 'bg-amber-500/5 border-amber-500/20 text-amber-300'
                    : 'bg-indigo-500/5 border-indigo-500/20 text-indigo-300'
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-current mt-1.5 shrink-0" />
                <span>{al.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Grid Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart 1: Assets by branch */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            Assets Distribution by Branch (KPI)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchChartData.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} interval={0} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: 11 }}
                />
                <Bar dataKey="Assets" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Assets by category */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            Assets Spread by Category (Units)
          </h3>
          <div className="h-64 flex items-center justify-center">
            <div className="w-full h-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <ReChartsPie>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  />
                </ReChartsPie>
              </ResponsiveContainer>
              {/* Center readout */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-slate-200">{kpis.totalCount}</span>
                <span className="text-[9px] text-slate-500 uppercase font-bold">Total Units</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart 3: Assets by status */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            Hardware Operational Status
          </h3>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <ReChartsPie>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="45%"
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: '#334155' }}
                >
                  {statusChartData.map((entry, index) => {
                    const color = entry.name === 'ACTIVE' ? '#10b981' : entry.name === 'REPAIR' ? '#f59e0b' : '#f43f5e';
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                />
                <Legend verticalAlign="bottom" height={28} />
              </ReChartsPie>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Grid Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart 4: Condition spread */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            Physical Wear & Tear Condition
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conditionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                />
                <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]}>
                  {conditionChartData.map((entry, index) => {
                    let fill = '#10b981'; // Green for EXCELLENT
                    if (entry.name === 'GOOD') fill = '#0f766e';
                    if (entry.name === 'FAIR') fill = '#f59e0b';
                    if (entry.name === 'POOR') fill = '#ef4444';
                    return <Cell key={`cell-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: Maintenance cost trends over time */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            Maintenance Costs Trajectory
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={maintTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="Costs" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 6: Budget vs spending (area) */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            Budget vs Spending Utilization
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={budgetVsSpending}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="category" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Amount']}
                />
                <Legend verticalAlign="top" height={36} />
                <Area type="monotone" dataKey="Budget" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.05} strokeWidth={2} />
                <Area type="monotone" dataKey="Spent" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
