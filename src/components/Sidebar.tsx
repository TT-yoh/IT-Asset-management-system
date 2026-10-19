import React from 'react';
import { Box, Layers, ArrowLeftRight, Wrench, PieChart, ShieldAlert, BarChart3, X, Menu, MoreHorizontal, Users, Building2 } from 'lucide-react';
import { User } from '../types';

export type NavTab = 'dashboard' | 'assets' | 'checkout' | 'repair' | 'users' | 'branches' | 'reports' | 'budget' | 'audit';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  assetCount: number;
  repairCount: number;
  userCount?: number;
  branchesCount?: number;
  currentUser?: User | null;
  isMobileDrawerOpen?: boolean;
  onToggleMobileDrawer?: () => void;
  onCloseMobileDrawer?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  assetCount,
  repairCount,
  userCount,
  branchesCount,
  currentUser,
  isMobileDrawerOpen = false,
  onToggleMobileDrawer,
  onCloseMobileDrawer
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Box className="w-4 h-4" /> },
    { id: 'assets', label: 'Assets', icon: <Layers className="w-4 h-4" />, badge: assetCount },
    { id: 'checkout', label: 'Checkouts', icon: <ArrowLeftRight className="w-4 h-4" /> },
    { id: 'repair', label: 'Maintenance', icon: <Wrench className="w-4 h-4" />, badge: repairCount > 0 ? repairCount : undefined },
    { id: 'users', label: 'Staff & Users', icon: <Users className="w-4 h-4" />, badge: userCount },
    { id: 'branches', label: 'Facilities & Branches', icon: <Building2 className="w-4 h-4" />, badge: branchesCount },
    { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'budget', label: 'Budgets', icon: <PieChart className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit & Access', icon: <ShieldAlert className="w-4 h-4" /> }
  ];

  let filteredItems = navItems;
  if (currentUser) {
    if (currentUser.role === 'ADMIN') {
      filteredItems = navItems;
    } else if (currentUser.role === 'DIRECTOR') {
      filteredItems = navItems.filter(item => ['dashboard', 'assets', 'users', 'branches', 'reports', 'budget', 'audit'].includes(item.id));
    } else if (currentUser.role === 'FINANCE') {
      filteredItems = navItems.filter(item => ['dashboard', 'assets', 'reports', 'budget'].includes(item.id));
    } else if (currentUser.role === 'IT_SUPPORT') {
      filteredItems = navItems.filter(item => ['dashboard', 'assets', 'checkout', 'repair', 'users', 'audit'].includes(item.id));
    } else if (currentUser.role === 'BRANCH_MANAGER') {
      filteredItems = navItems.filter(item => ['dashboard', 'assets', 'checkout', 'repair', 'branches', 'budget'].includes(item.id));
    } else if (currentUser.role === 'USER') {
      filteredItems = navItems.filter(item => ['dashboard', 'assets', 'checkout', 'repair'].includes(item.id));
    }
  }

  const handleSelectTab = (tab: NavTab) => {
    onSelectTab(tab);
    if (onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  return (
    <>
      {/* ====================================================================
          1. DESKTOP SIDEBAR (md and above)
         ==================================================================== */}
      <aside className="hidden md:flex flex-col w-60 bg-slate-900/95 border-r border-slate-800 p-3 justify-between shrink-0 overflow-y-auto">
        <div className="space-y-1 w-full">
          <div className="px-3 py-2 text-[10px] font-bold tracking-wider uppercase text-slate-500">
            Navigation
          </div>

          {filteredItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div className={isActive ? 'text-emerald-400' : 'text-slate-400'}>
                    {item.icon}
                  </div>
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && (
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ml-2 ${
                    isActive ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-400 border border-slate-700/80'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ====================================================================
          2. MOBILE SLIDE-OVER DRAWER (md:hidden)
         ==================================================================== */}
      {isMobileDrawerOpen && (
        <div className="md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 animate-in fade-in duration-200"
            onClick={onCloseMobileDrawer}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 z-50 p-4 flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-200 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                    <Box className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white leading-tight">Universal IT System</div>
                    <div className="text-[10px] text-emerald-400 font-medium">Enterprise Workspace</div>
                  </div>
                </div>
                <button
                  onClick={onCloseMobileDrawer}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white transition"
                  aria-label="Close Navigation Menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-2 py-1 text-[10px] font-bold tracking-wider uppercase text-slate-500 mb-1">
                Workspace Sections
              </div>

              <div className="space-y-1">
                {filteredItems.map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={isActive ? 'text-emerald-400' : 'text-slate-400'}>
                          {item.icon}
                        </div>
                        <span>{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                          isActive ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-400 border border-slate-700/80'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-3 mt-6">
              {currentUser && (
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-emerald-400 shrink-0">
                    {currentUser.fullName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-200 truncate">{currentUser.fullName}</div>
                    <div className="text-[10px] text-slate-400 truncate">{currentUser.role} • {currentUser.branchName}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          3. MOBILE BOTTOM NAVIGATION BAR (md:hidden)
         ==================================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 md:hidden flex justify-around items-center px-1 py-1.5 shadow-2xl safe-area-bottom">
        <button
          onClick={() => handleSelectTab('dashboard')}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition ${
            activeTab === 'dashboard' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Box className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 tracking-tight">Dashboard</span>
        </button>

        <button
          onClick={() => handleSelectTab('assets')}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition relative ${
            activeTab === 'assets' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Layers className="w-5 h-5" />
            {assetCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 min-w-[14px] h-[14px] bg-emerald-500 text-slate-950 text-[9px] font-bold rounded-full flex items-center justify-center font-mono">
                {assetCount > 99 ? '99+' : assetCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Assets</span>
        </button>

        <button
          onClick={() => handleSelectTab('checkout')}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition ${
            activeTab === 'checkout' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowLeftRight className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 tracking-tight">Checkouts</span>
        </button>

        <button
          onClick={() => handleSelectTab('repair')}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition relative ${
            activeTab === 'repair' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Wrench className="w-5 h-5" />
            {repairCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 min-w-[14px] h-[14px] bg-amber-500 text-slate-950 text-[9px] font-bold rounded-full flex items-center justify-center font-mono">
                {repairCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Repair</span>
        </button>

        <button
          onClick={onToggleMobileDrawer}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition ${
            isMobileDrawerOpen || ['reports', 'budget', 'audit'].includes(activeTab)
              ? 'text-emerald-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 tracking-tight">More</span>
        </button>
      </nav>
    </>
  );
};
