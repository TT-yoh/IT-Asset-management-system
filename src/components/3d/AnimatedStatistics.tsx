import React, { useEffect, useState } from 'react';
import { Asset, MaintenanceRecord, Budget } from '../../types';
import { BarChart3, TrendingUp, DollarSign, ShieldAlert, Cpu, Activity } from 'lucide-react';

interface AnimatedStatisticsProps {
  assets: Asset[];
  maintenances: MaintenanceRecord[];
  budgets?: Budget[];
}

export const AnimatedStatistics: React.FC<AnimatedStatisticsProps> = ({
  assets,
  maintenances,
  budgets = []
}) => {
  const totalVal = assets.reduce((sum, a) => sum + (a.purchasePrice || 1200), 0);
  const repairCost = maintenances.reduce((sum, m) => sum + (m.cost || 0), 0);
  const activeRate = assets.length > 0 ? Math.round((assets.filter(a => a.status === 'ACTIVE').length / assets.length) * 100) : 100;

  // Spring count-up effect
  const [displayVal, setDisplayVal] = useState(0);
  const [displayRepair, setDisplayRepair] = useState(0);

  useEffect(() => {
    let step = 0;
    const interval = setInterval(() => {
      step += 0.1;
      setDisplayVal(prev => Math.min(totalVal, prev + totalVal * 0.15));
      setDisplayRepair(prev => Math.min(repairCost, prev + repairCost * 0.15));
      if (step >= 1) clearInterval(interval);
    }, 40);
    return () => clearInterval(interval);
  }, [totalVal, repairCost]);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-full max-w-4xl px-4 pointer-events-none">
      <div className="bg-slate-900/95 border border-slate-800 p-4 rounded-2xl shadow-2xl backdrop-blur-xl pointer-events-auto flex flex-wrap items-center justify-between gap-4">
        
        {/* Metric 1 */}
        <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800/80 flex-1 min-w-[180px]">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><DollarSign className="w-5 h-5" /></div>
          <div>
            <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-wider">Total Hardware Value</span>
            <span className="text-lg font-mono font-bold text-white">${Math.round(displayVal).toLocaleString()}</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800/80 flex-1 min-w-[180px]">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20"><ShieldAlert className="w-5 h-5" /></div>
          <div>
            <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-wider">Mnt. Repair Expenditure</span>
            <span className="text-lg font-mono font-bold text-rose-400">${Math.round(displayRepair).toLocaleString()}</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800/80 flex-1 min-w-[180px]">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><Activity className="w-5 h-5" /></div>
          <div>
            <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-wider">Active Device Rate</span>
            <span className="text-lg font-mono font-bold text-emerald-400">{activeRate}% Fleet Ready</span>
          </div>
        </div>

      </div>
    </div>
  );
};
