import React, { useState, useEffect } from 'react';
import { Organization, User, SystemNotification, Branch, Asset } from '../types';
import { 
  Bell, 
  Search, 
  ChevronDown, 
  Menu, 
  X, 
  Clock, 
  AlertTriangle, 
  Info, 
  CheckCircle2,
  Sparkles,
  Camera,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Settings,
  ChevronRight
} from 'lucide-react';
import { subscribeOfflineStatus, OfflineSyncStatus } from '../lib/offline-sync';
import { UserSettingsModal } from './UserSettingsModal';

interface NavbarProps {
  currentOrg: Organization;
  users: User[];
  currentUser: User | null;
  onSelectUser: (user: User | null) => void;
  notifications: SystemNotification[];
  onMarkNotificationsRead: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onUpdateUser?: (user: User) => void;
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
  onOpenScanner?: () => void;
  onLogout?: () => void;
  branches?: Branch[];
  assets?: Asset[];
}

export const Navbar: React.FC<NavbarProps> = ({
  currentOrg,
  users,
  currentUser,
  onSelectUser,
  notifications,
  onMarkNotificationsRead,
  searchQuery,
  onSearchChange,
  onUpdateUser,
  onToggleMobileMenu,
  isMobileMenuOpen,
  onOpenScanner,
  onLogout,
  branches = [],
  assets = []
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRoleSimulator, setShowRoleSimulator] = useState(false);

  // Network & TiDB offline sync status
  const [syncStatus, setSyncStatus] = useState<OfflineSyncStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    queuedCount: 0,
    deadLetterCount: 0
  });

  useEffect(() => {
    const unsub = subscribeOfflineStatus((st) => setSyncStatus(st));
    return () => unsub();
  }, []);

  if (!currentUser) return null;

  const unreadCount = notifications.filter(n => !n.read).length;
  const orgUsers = users.filter(u => u.orgId === currentOrg.id);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'DIRECTOR': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'BRANCH_MANAGER': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'IT_SUPPORT': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'FINANCE': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <>
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-3 md:px-6 flex items-center justify-between z-30 sticky top-0 shadow-lg">
        {/* Left: Mobile Menu Toggle + Organization Brand + Connection Status */}
        <div className="flex items-center space-x-2 md:space-x-4">
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-2 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition flex items-center justify-center shrink-0"
              aria-label="Toggle navigation drawer"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5 text-emerald-400" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          {/* Dedicated Company Brand Badge */}
          <div className="flex items-center space-x-2 sm:space-x-2.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-left">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-sm sm:text-base shrink-0">
              {currentOrg.logo || '🏢'}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-white tracking-tight truncate max-w-[110px] sm:max-w-[190px]">
                  {currentOrg.name}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Active Multi-Tenant Context" />
              </div>
              <span className="text-[9px] sm:text-[10px] text-emerald-400 font-semibold block leading-none mt-0.5 truncate max-w-[110px] sm:max-w-[190px]">
                {currentOrg.type}
              </span>
            </div>
          </div>

          {/* Simple, Human-Friendly Connection Status Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/60 border border-slate-800 text-xs">
            {syncStatus.deadLetterCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                ⚠️ {syncStatus.deadLetterCount} sync failed
              </span>
            )}
            {syncStatus.isOnline ? (
              syncStatus.queuedCount > 0 ? (
                <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Syncing {syncStatus.queuedCount} updates...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Connected</span>
                </div>
              )
            ) : (
              <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Working Offline ({syncStatus.queuedCount} queued)</span>
              </div>
            )}
          </div>
        </div>

        {/* Middle: Universal Asset Search */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={`Search ${currentOrg.name} devices, serials, staff...`}
              className="w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-emerald-500 focus:outline-none rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 transition-all"
            />
            {searchQuery && (
              <button onClick={() => onSearchChange('')} className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white">✕</button>
            )}
          </div>
        </div>

        {/* Right: Camera Scanner, AI Assistant, Notifications & Profile */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 md:space-x-3">
          {/* Quick Camera Scanner Button */}
          {onOpenScanner && (
            <button
              onClick={onOpenScanner}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition text-xs font-semibold cursor-pointer"
              title="Open Barcode & QR Scanner"
            >
              <Camera className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Scan Tag</span>
            </button>
          )}

          {/* Mobile Search Toggle */}
          <button
            onClick={() => setShowMobileSearch(!showMobileSearch)}
            className="md:hidden p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition shrink-0"
            title="Search assets"
            aria-label="Toggle mobile search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifMenu(!showNotifMenu); setShowUserMenu(false); }}
              className="relative p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 md:w-96 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50">
                <div className="p-3.5 bg-slate-900/90 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Bell className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">System Alerts</span>
                  </div>
                  {unreadCount > 0 && (
                    <button onClick={onMarkNotificationsRead} className="text-[11px] text-emerald-400 hover:underline font-medium">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-700/50">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">No alerts found.</div>
                  ) : (
                    notifications.map(notif => (
                      <div key={notif.id} className={`p-3.5 transition-colors ${!notif.read ? 'bg-slate-750/60 border-l-2 border-emerald-500' : 'opacity-70'}`}>
                        <div className="flex items-start space-x-3">
                          <div className="mt-0.5">
                            {notif.type === 'WARRANTY' && <Clock className="w-4 h-4 text-amber-400" />}
                            {notif.type === 'MAINTENANCE' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
                            {notif.type === 'ALERT' && <Info className="w-4 h-4 text-blue-400" />}
                            {notif.type === 'ASSIGNMENT' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          </div>
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-white">{notif.title}</div>
                            <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{notif.message}</p>
                            <span className="text-[10px] text-slate-400 mt-1 block">{notif.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile & Role Switcher Simulator */}
          <div className="relative">
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifMenu(false); }}
              className="flex items-center space-x-2.5 p-1.5 md:px-3 md:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/90 border border-slate-700 transition-colors text-left"
            >
              <img
                src={currentUser.avatar}
                alt={currentUser.fullName}
                className="w-7 h-7 rounded-full object-cover border border-emerald-500/50"
              />
              <div className="hidden sm:block">
                <div className="text-xs font-semibold text-white leading-tight truncate max-w-[110px]">
                  {currentUser.fullName}
                </div>
                <div className="flex items-center space-x-1 mt-0.5">
                  <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono font-bold ${getRoleBadgeColor(currentUser.role)}`}>
                    {currentUser.role}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50">
                <div className="p-3 bg-slate-900 border-b border-slate-700">
                  <div className="text-xs font-bold text-white">{currentUser.fullName}</div>
                  <div className="text-[11px] text-slate-400">{currentUser.email}</div>
                  <div className="text-[10px] text-emerald-400 mt-1 font-mono">{currentUser.branchName}</div>
                </div>

                {/* My Profile & Settings Action */}
                <div className="p-2 border-b border-slate-700">
                  <button
                    onClick={() => {
                      setShowSettingsModal(true);
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-700/70 transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Settings className="w-4 h-4 text-emerald-400 group-hover:rotate-45 transition-transform" />
                      <span>My Profile & Settings</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                  </button>
                </div>

                {/* Collapsible Role Simulator for testing/preview */}
                <div className="p-2 border-b border-slate-700">
                  <button
                    onClick={() => setShowRoleSimulator(!showRoleSimulator)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] uppercase font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer rounded-lg hover:bg-slate-700/40"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>Role Simulator</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-750 border border-slate-700 text-slate-400 normal-case font-normal font-sans">
                        Preview
                      </span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showRoleSimulator ? 'rotate-180' : ''}`} />
                  </button>

                  {showRoleSimulator && (
                    <div className="mt-1 space-y-0.5 max-h-48 overflow-y-auto pr-1">
                      {orgUsers.map(user => (
                        <button
                          key={user.id}
                          onClick={() => { onSelectUser(user); setShowUserMenu(false); }}
                          className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            user.id === currentUser.id ? 'bg-emerald-500/10 text-emerald-300' : 'hover:bg-slate-700/50 text-slate-300'
                          }`}
                        >
                          <div className="truncate">
                            <div className="font-semibold text-white">{user.fullName}</div>
                            <div className="text-[10px] text-slate-400">{user.email}</div>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold shrink-0 ml-2 ${getRoleBadgeColor(user.role)}`}>
                            {user.role}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {onLogout && (
                  <div className="p-2 bg-slate-900/80 border-t border-slate-700">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <LogOut className="w-4 h-4 text-rose-400 group-hover:translate-x-0.5 transition-transform" />
                        <span>Sign Out</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400">Exit</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* User Settings & Profile Modal */}
      {showSettingsModal && onUpdateUser && (
        <UserSettingsModal
          currentUser={currentUser}
          currentOrg={currentOrg}
          branches={branches}
          assets={assets}
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onUpdateUser={(updated) => {
            onUpdateUser(updated);
          }}
        />
      )}

      {/* Mobile Search Bar Dropdown */}
      {showMobileSearch && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 p-3 flex items-center z-20">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search devices, serials, staff..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            {searchQuery && (
              <button onClick={() => onSearchChange('')} className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white">✕</button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
