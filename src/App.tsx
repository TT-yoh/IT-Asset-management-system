import React, { useState, useEffect } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
const Dashboard3D = React.lazy(() => import('./components/Dashboard3D').then(m => ({ default: m.Dashboard3D })));
import { AssetManager } from './components/AssetManager';
import { CheckoutPanel } from './components/CheckoutPanel';
import { MaintenancePanel } from './components/MaintenancePanel';
import { BudgetPanel } from './components/BudgetPanel';
import { AuditPanel } from './components/AuditPanel';
import { ReportsPanel } from './components/ReportsPanel';
import { UsersPanel } from './components/UsersPanel';
import { FacilitiesPanel } from './components/FacilitiesPanel';
import { LoginPortal } from './components/auth/LoginPortal';
import { TiDBSyncModal } from './components/TiDBSyncModal';
import { QuickScannerModal, resolveAssetFromScan } from './components/QuickScannerModal';
import { AssetDetailModal } from './components/asset-manager/AssetDetailModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeedbackProvider } from './context/FeedbackContext';
import { CATEGORIES } from './constants/categories';
import { canAccessTab } from '../shared/permissions';
import {
  AuthProvider,
  useAuth,
  NotificationProvider,
  useNotifications,
  AssetProvider,
  useAssets
} from './context';
import { Asset } from './types';

const VALID_TABS: NavTab[] = ['dashboard', 'assets', 'checkout', 'repair', 'branches', 'users', 'reports', 'budget', 'audit'];

const getTabFromHash = (role?: string | null): NavTab => {
  if (typeof window === 'undefined') return 'dashboard';
  const clean = window.location.hash.replace(/^#\/?/, '').trim();
  const tab = VALID_TABS.includes(clean as NavTab) ? (clean as NavTab) : 'dashboard';
  if (role && !canAccessTab(role, tab)) {
    return 'dashboard';
  }
  return tab;
};

function AppShell() {
  const {
    currentUser,
    currentOrg,
    isSessionLoading,
    systemOrgs,
    systemUsers,
    currentOrgBranches,
    systemDepartments,
    currentOrgDepartments,
    handleLoginSuccess,
    handleRegisterOrganization,
    handleActivateUser,
    handleInviteUser,
    handleRegisterUser,
    handleUpdateUser,
    handleApplySavedUser,
    handleDeleteUser,
    handleClearDummyUsers,
    handleUpdateBranch,
    handleRegisterBranch,
    handleDeleteBranch,
    handleRegisterDepartment,
    handleUpdateDepartment,
    handleDeleteDepartment,
    handleSelectOrg,
    handleLogout
  } = useAuth();

  const {
    notifications,
    markAllAsRead
  } = useNotifications();

  const {
    filteredAssets,
    filteredCheckouts,
    filteredMaintenances,
    filteredBudgets,
    handleSaveBudget,
    handleDeleteBudget,
    filteredAuditLogs,
    searchQuery,
    setSearchQuery,
    refreshAppData,
    handleAddAsset,
    handleUpdateAsset,
    handleDeleteAsset,
    handleBulkAddAssets,
    handleBatchUpdateStatus,
    handleBatchTransferBranch,
    handleBatchDeleteAssets,
    handleNewCheckout,
    handleReturnAsset,
    handleReportIssue,
    handleCompleteRepair,
    handleUpdateTicket,
    showTiDBModal,
    setShowTiDBModal,
    tiDBSyncTime,
    lastSyncedAt,
    isInitialDataLoading
  } = useAssets();

  const [activeTab, setActiveTabState] = useState<NavTab>(() => getTabFromHash());
  const [initialAssetStatusFilter, setInitialAssetStatusFilter] = useState<string>('ALL');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isGlobalScannerOpen, setIsGlobalScannerOpen] = useState<boolean>(false);
  const [inspectingAsset, setInspectingAsset] = useState<Asset | null>(null);
  const [facilitiesSubTab, setFacilitiesSubTab] = useState<'branches' | 'departments'>('branches');
  const mainViewportRef = React.useRef<HTMLElement>(null);

  // Deep-link & Scanned QR code inspector: resolves ?asset=, ?code=, or ?tag= from physical stickers
  useEffect(() => {
    if (!currentUser || filteredAssets.length === 0) return;

    const checkScannedUrl = () => {
      let targetCode: string | null = null;
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        targetCode = urlParams.get('asset') || urlParams.get('code') || urlParams.get('tag');

        if (!targetCode && window.location.hash.includes('?')) {
          const hashQuery = window.location.hash.substring(window.location.hash.indexOf('?'));
          const hashParams = new URLSearchParams(hashQuery);
          targetCode = hashParams.get('asset') || hashParams.get('code') || hashParams.get('tag');
        }

        // Check if there was a saved redirect from pre-auth scan
        if (!targetCode) {
          try {
            targetCode = sessionStorage.getItem('omni_redirect_asset');
            if (targetCode) sessionStorage.removeItem('omni_redirect_asset');
          } catch {}
        }
      }

      if (targetCode) {
        const { asset } = resolveAssetFromScan(targetCode, filteredAssets);
        if (asset) {
          setInspectingAsset(asset);
        }
      }
    };

    checkScannedUrl();
    window.addEventListener('popstate', checkScannedUrl);
    window.addEventListener('hashchange', checkScannedUrl);
    return () => {
      window.removeEventListener('popstate', checkScannedUrl);
      window.removeEventListener('hashchange', checkScannedUrl);
    };
  }, [currentUser, filteredAssets]);

  // Immediate scroll reset helper for window, document, and main viewport
  const scrollToTop = React.useCallback((smooth = false) => {
    const behavior = smooth ? 'smooth' : 'instant';
    if (mainViewportRef.current) {
      try {
        mainViewportRef.current.scrollTo({ top: 0, behavior });
      } catch {
        mainViewportRef.current.scrollTop = 0;
      }
    }
    if (typeof window !== 'undefined') {
      try {
        window.scrollTo({ top: 0, behavior });
      } catch {
        window.scrollTo(0, 0);
      }
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  // Smooth scroll reset whenever tab changes so the new page never starts in an awkward scrolled position
  useEffect(() => {
    scrollToTop();
  }, [activeTab, scrollToTop]);

  // Navigate between tabs with browser history tracking (popstate / back arrow support)
  const navigateToTab = (tab: NavTab, replace = false) => {
    const target = canAccessTab(currentUser?.role, tab) ? tab : 'dashboard';
    setActiveTabState(target);
    scrollToTop();
    if (typeof window !== 'undefined') {
      const targetHash = `#/${target}`;
      if (replace) {
        window.history.replaceState({ tab: target }, '', targetHash);
      } else if (window.location.hash !== targetHash) {
        window.history.pushState({ tab: target }, '', targetHash);
      }
    }
  };

  // Sync browser back/forward buttons with current view tab
  useEffect(() => {
    const handleHistoryChange = () => {
      const cleanHash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();

      if (VALID_TABS.includes(cleanHash as NavTab)) {
        const candidate = cleanHash as NavTab;
        if (canAccessTab(currentUser?.role, candidate)) {
          setActiveTabState(candidate);
        } else {
          navigateToTab('dashboard', true);
        }
      } else if (!cleanHash) {
        // If at root URL, stay on dashboard without forcing a destructive logout
        if (currentUser) {
          navigateToTab('dashboard', true);
        }
      } else if (cleanHash === 'login' || cleanHash === 'activate') {
        if (currentUser) {
          navigateToTab('dashboard', true);
        }
      }
    };

    window.addEventListener('popstate', handleHistoryChange);
    window.addEventListener('hashchange', handleHistoryChange);

    return () => {
      window.removeEventListener('popstate', handleHistoryChange);
      window.removeEventListener('hashchange', handleHistoryChange);
    };
  }, [currentUser]);

  // Ensure activeTab immediately resolves from 'login'/'activate' to a valid permitted tab upon sign-in
  useEffect(() => {
    if (currentUser) {
      const currentHashTab = getTabFromHash(currentUser.role);
      setActiveTabState(currentHashTab);
    }
  }, [currentUser?.id, currentUser?.role]);

  // Display clean security verification splash while validating session cookie
  // Hooks must run on every render, so this stays above the signed-out early returns below.
  // Enforce branch boundary for branch managers and restricted users
  const isBranchRestricted = currentUser?.role === 'BRANCH_MANAGER' || currentUser?.role === 'USER';

  const filteredUsers = React.useMemo(() => {
    return systemUsers.filter(u => {
      if (u.orgId && u.orgId !== currentOrg.id) return false;
      if (isBranchRestricted && currentUser) {
        const matchesBranchId = Boolean(currentUser.branchId && u.branchId === currentUser.branchId);
        const matchesBranchName = Boolean(currentUser.branchName && u.branchName && u.branchName.toLowerCase() === currentUser.branchName.toLowerCase());
        return matchesBranchId || matchesBranchName || u.id === currentUser.id;
      }
      return true;
    });
  }, [systemUsers, currentOrg.id, currentUser, isBranchRestricted]);

  if (isSessionLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 animate-pulse">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="text-sm font-bold text-white tracking-wide">OmniAsset Enterprise Security</div>
        <div className="text-xs text-slate-400 mt-2 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Verifying security session...</span>
        </div>
      </div>
    );
  }

  // If not authenticated, save intended tab/asset and render LoginPortal immediately
  if (!currentUser) {
    const requested = getTabFromHash();
    if (requested && requested !== 'dashboard' && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('omni_redirect_tab', requested);
      } catch {}
    }
    if (typeof window !== 'undefined' && window.location.search) {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const scanned = searchParams.get('asset') || searchParams.get('code') || searchParams.get('tag');
        if (scanned) {
          sessionStorage.setItem('omni_redirect_asset', scanned);
        }
      } catch {}
    }
    return (
      <LoginPortal
        organizations={systemOrgs}
        users={systemUsers}
        onLoginSuccess={handleLoginSuccess}
        onRegisterOrganization={handleRegisterOrganization}
        onActivateUser={handleActivateUser}
      />
    );
  }

  const orgAssetsCount = filteredAssets.length;
  const orgRepairsCount = filteredMaintenances.filter(m => m.status === 'IN_PROGRESS').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <Navbar
        currentOrg={currentOrg}
        users={filteredUsers}
        currentUser={currentUser}
        notifications={notifications.filter(n => !n.orgId || n.orgId === currentOrg.id)}
        onMarkNotificationsRead={() => markAllAsRead(currentOrg.id)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        // The settings window saves profile and 2FA changes through its own routes.
        onUpdateUser={handleApplySavedUser}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMobileMenuOpen={isMobileMenuOpen}
        onOpenScanner={() => setIsGlobalScannerOpen(true)}
        onLogout={handleLogout}
        branches={currentOrgBranches}
        assets={filteredAssets}
        departments={currentOrgDepartments}
        systemOrgs={systemOrgs}
        onSelectOrg={handleSelectOrg}
        onRefreshData={refreshAppData}
      />

      {/* Main Container: Sidebar + Active Tab Viewport */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            navigateToTab(tab);
            setIsMobileMenuOpen(false);
            if (tab !== 'assets') {
              setInitialAssetStatusFilter('ALL');
            }
          }}
          assetCount={orgAssetsCount}
          repairCount={orgRepairsCount}
          userCount={filteredUsers.length}
          branchesCount={currentOrgBranches.length}
          currentUser={currentUser}
          isMobileDrawerOpen={isMobileMenuOpen}
          onToggleMobileDrawer={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onCloseMobileDrawer={() => setIsMobileMenuOpen(false)}
        />

        <main
          ref={mainViewportRef}
          className="flex-1 overflow-y-auto bg-slate-950 p-2 sm:p-4 md:p-6 pb-24 md:pb-8"
        >
          <div key={activeTab} className="animate-fadeIn">
            <ErrorBoundary
              key={activeTab}
              fallbackTitle={`Error Loading ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} View`}
              onReset={() => navigateToTab('assets')}
            >
          {activeTab === 'dashboard' && (
            <React.Suspense fallback={
              <div className="flex items-center justify-center p-16 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              </div>
            }>
              <Dashboard3D
                currentOrg={currentOrg}
                assets={filteredAssets}
                maintenances={filteredMaintenances}
                budgets={filteredBudgets}
                currentUser={currentUser}
                onNavigateToAssets={(status) => {
                  setInitialAssetStatusFilter(status);
                  navigateToTab('assets');
                }}
              />
            </React.Suspense>
          )}

          {activeTab === 'assets' && (
            <AssetManager
              isLoading={isInitialDataLoading}
              departments={currentOrgDepartments}
              currentOrg={currentOrg}
              branches={currentOrgBranches}
              categories={CATEGORIES}
              assets={filteredAssets}
              currentUser={currentUser}
              onAddAsset={handleAddAsset}
              onUpdateAsset={handleUpdateAsset}
              onDeleteAsset={handleDeleteAsset}
              onBulkAddAssets={handleBulkAddAssets}
              onBatchUpdateStatus={handleBatchUpdateStatus}
              onBatchTransferBranch={handleBatchTransferBranch}
              onBatchDelete={handleBatchDeleteAssets}
              searchQuery={searchQuery}
              initialStatusFilter={initialAssetStatusFilter}
              onReportIssue={(ast: Asset) => {
                handleReportIssue({
                  id: `mnt-${Date.now()}`,
                  assetId: ast.id,
                  assetCode: ast.assetCode,
                  assetName: ast.name,
                  type: 'REPAIR',
                  status: 'IN_PROGRESS',
                  description: 'Flagged for hardware diagnostic review',
                  reportedBy: currentUser.fullName,
                  assignedTechnician: currentUser.fullName,
                  startDate: new Date().toISOString().split('T')[0]!,
                  expectedCompletion: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]!,
                  cost: 150
                });
                navigateToTab('repair');
              }}
            />
          )}

          {activeTab === 'checkout' && (
            <CheckoutPanel
              checkouts={filteredCheckouts}
              assets={filteredAssets}
              users={filteredUsers}
              currentUser={currentUser}
              branches={currentOrgBranches}
              onNewCheckout={handleNewCheckout}
              onReturnAsset={handleReturnAsset}
            />
          )}

          {activeTab === 'repair' && (
            <MaintenancePanel
              maintenances={filteredMaintenances}
              assets={filteredAssets}
              users={filteredUsers}
              currentUser={currentUser}
              onReportIssue={handleReportIssue}
              onUpdateTicket={handleUpdateTicket}
              onCompleteRepair={handleCompleteRepair}
            />
          )}

          {activeTab === 'budget' && (
            <BudgetPanel
              currentOrg={currentOrg}
              budgets={filteredBudgets}
              currentUser={currentUser}
              departments={currentOrgDepartments}
              branches={currentOrgBranches}
              onSaveBudget={handleSaveBudget}
              onDeleteBudget={handleDeleteBudget}
            />
          )}

          {activeTab === 'audit' && (
            <AuditPanel
              currentOrg={currentOrg}
              currentUser={currentUser}
              branches={currentOrgBranches}
              auditLogs={filteredAuditLogs}
              onUpdateBranch={handleUpdateBranch}
              onRegisterBranch={handleRegisterBranch}
              onNavigateToUsers={() => navigateToTab('users')}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsPanel
              currentOrg={currentOrg}
              assets={filteredAssets}
              maintenances={filteredMaintenances}
              budgets={filteredBudgets}
              branches={currentOrgBranches}
              checkouts={filteredCheckouts}
            />
          )}

          {activeTab === 'branches' && (
            <FacilitiesPanel
              currentOrg={currentOrg}
              currentUser={currentUser}
              branches={currentOrgBranches}
              departments={currentOrgDepartments}
              users={filteredUsers}
              assets={filteredAssets}
              initialSubTab={facilitiesSubTab}
              onRegisterBranch={handleRegisterBranch}
              onUpdateBranch={handleUpdateBranch}
              onDeleteBranch={handleDeleteBranch}
              onRegisterDepartment={handleRegisterDepartment}
              onUpdateDepartment={handleUpdateDepartment}
              onDeleteDepartment={handleDeleteDepartment}
              onNavigateToTab={navigateToTab}
            />
          )}

          {activeTab === 'users' && (
            <UsersPanel
              currentOrg={currentOrg}
              users={filteredUsers}
              currentUser={currentUser}
              branches={currentOrgBranches}
              departments={currentOrgDepartments}
              assets={filteredAssets}
              auditLogs={filteredAuditLogs}
              onRegisterUser={handleRegisterUser}
              onInviteUser={handleInviteUser}
              onUpdateUser={handleUpdateUser}
              onDeleteUser={handleDeleteUser}
              onUpdateAsset={handleUpdateAsset}
              onClearDummyUsers={handleClearDummyUsers}
              onNavigateToDepartments={() => {
                setFacilitiesSubTab('departments');
                navigateToTab('branches');
              }}
            />
          )}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Quick Camera Barcode/QR Scanner Modal */}
      {(() => {
        const isITTeam = currentUser.role === 'ADMIN' || currentUser.role === 'IT_SUPPORT';
        const canAddAsset = isITTeam || currentUser.role === 'BRANCH_MANAGER';
        const canEditAsset = isITTeam || currentUser.role === 'BRANCH_MANAGER';

        return (
          <>
            <QuickScannerModal
              isOpen={isGlobalScannerOpen}
              onClose={() => setIsGlobalScannerOpen(false)}
              assets={filteredAssets}
              currentUser={currentUser}
              onSelectAssetForCheckout={(ast) => {
                setSearchQuery(ast.assetCode);
                navigateToTab('assets');
              }}
              onSelectAssetForReturn={(ast) => {
                setSearchQuery(ast.assetCode);
                navigateToTab('assets');
              }}
              onSelectAssetForRepair={(ast) => {
                handleReportIssue({
                  id: `mnt-${Date.now()}`,
                  assetId: ast.id,
                  assetCode: ast.assetCode,
                  assetName: ast.name,
                  type: 'REPAIR',
                  status: 'IN_PROGRESS',
                  description: 'Scanned via quick camera diagnostic intake',
                  reportedBy: currentUser.fullName,
                  assignedTechnician: currentUser.fullName,
                  startDate: new Date().toISOString().split('T')[0]!,
                  expectedCompletion: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]!,
                  cost: 150
                });
                navigateToTab('repair');
              }}
              onEnrollScannedTag={canAddAsset ? (tag) => {
                setSearchQuery(tag);
                navigateToTab('assets');
              } : undefined}
              onUpdateAssetStatus={(assetId, st) => {
                if (canEditAsset) handleBatchUpdateStatus([assetId], st);
              }}
              onViewAssetDetails={(ast) => {
                setInspectingAsset(ast);
              }}
            />

            {/* Universal Asset Detail & Passport Modal (Scanned QR tags or deep link) */}
            {inspectingAsset && (
              <AssetDetailModal
                asset={inspectingAsset}
                onClose={() => {
                  setInspectingAsset(null);
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    if (url.searchParams.has('asset') || url.searchParams.has('code') || url.searchParams.has('tag')) {
                      url.searchParams.delete('asset');
                      url.searchParams.delete('code');
                      url.searchParams.delete('tag');
                      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
                    }
                  }
                }}
                onEdit={canEditAsset ? (ast) => {
                  setInspectingAsset(null);
                  setSearchQuery(ast.assetCode);
                  navigateToTab('assets');
                } : undefined}
                onReportRepair={(ast) => {
                  setInspectingAsset(null);
                  handleReportIssue({
                    id: `mnt-${Date.now()}`,
                    assetId: ast.id,
                    assetCode: ast.assetCode,
                    assetName: ast.name,
                    type: 'REPAIR',
                    status: 'IN_PROGRESS',
                    description: 'Reported issue from scanned tag passport',
                    reportedBy: currentUser.fullName,
                    assignedTechnician: currentUser.fullName,
                    startDate: new Date().toISOString().split('T')[0]!,
                    expectedCompletion: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]!,
                    cost: 150
                  });
                  navigateToTab('repair');
                }}
              />
            )}
          </>
        );
      })()}

      {/* TiDB Database Connection & HTAP Sync Modal */}
      {showTiDBModal && (
        <TiDBSyncModal
          isOpen={showTiDBModal}
          onClose={() => setShowTiDBModal(false)}
          lastSyncedAt={tiDBSyncTime}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="Application Error" onReset={() => { window.location.hash = ''; window.location.reload(); }}>
      <FeedbackProvider>
        <AuthProvider>
          <NotificationProvider>
            <AssetProvider>
              <AppShell />
            </AssetProvider>
          </NotificationProvider>
        </AuthProvider>
      </FeedbackProvider>
    </ErrorBoundary>
  );
}
