import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { Dashboard3D } from './components/Dashboard3D';
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
import { CATEGORIES } from './mockData';
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

const getTabFromHash = (): NavTab => {
  if (typeof window === 'undefined') return 'dashboard';
  const clean = window.location.hash.replace(/^#\/?/, '').trim();
  return VALID_TABS.includes(clean as NavTab) ? (clean as NavTab) : 'dashboard';
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
    handleDeleteUser,
    handleClearDummyUsers,
    handleUpdateBranch,
    handleRegisterBranch,
    handleDeleteBranch,
    handleRegisterDepartment,
    handleUpdateDepartment,
    handleDeleteDepartment,
    handleSwitchUser,
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
    lastSyncedAt
  } = useAssets();

  const [activeTab, setActiveTabState] = useState<NavTab>(() => getTabFromHash());
  const [initialAssetStatusFilter, setInitialAssetStatusFilter] = useState<string>('ALL');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isGlobalScannerOpen, setIsGlobalScannerOpen] = useState<boolean>(false);
  const [inspectingAsset, setInspectingAsset] = useState<Asset | null>(null);
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

  // Smooth scroll reset whenever tab changes so the new page never starts in an awkward scrolled position
  useEffect(() => {
    if (mainViewportRef.current) {
      mainViewportRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  // Navigate between tabs with browser history tracking (popstate / back arrow support)
  const navigateToTab = (tab: NavTab, replace = false) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const targetHash = `#/${tab}`;
      if (replace) {
        window.history.replaceState({ tab }, '', targetHash);
      } else if (window.location.hash !== targetHash) {
        window.history.pushState({ tab }, '', targetHash);
      }
    }
  };

  // Sync browser back/forward buttons with current view tab
  useEffect(() => {
    const handleHistoryChange = () => {
      const cleanHash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();

      if (VALID_TABS.includes(cleanHash as NavTab)) {
        setActiveTabState(cleanHash as NavTab);
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

  // While verifying background session cookie without cached session, show smooth splash
  if (isSessionLoading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-emerald-500">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <span className="text-xl">🌐</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">OmniAsset Enterprise</h1>
            <p className="text-[11px] text-slate-500">Restoring encrypted session...</p>
          </div>
        </div>
      </div>
    );
  }

  // If not authenticated, save intended tab/asset and render LoginPortal
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
        users={systemUsers}
        currentUser={currentUser}
        onSelectUser={handleSwitchUser}
        notifications={notifications.filter(n => !n.orgId || n.orgId === currentOrg.id)}
        onMarkNotificationsRead={() => markAllAsRead(currentOrg.id)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onUpdateUser={handleUpdateUser}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMobileMenuOpen={isMobileMenuOpen}
        onOpenScanner={() => setIsGlobalScannerOpen(true)}
        onLogout={handleLogout}
        branches={currentOrgBranches}
        assets={filteredAssets}
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
          userCount={systemUsers.filter(u => u.orgId === currentOrg.id).length}
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
          )}

          {activeTab === 'assets' && (
            <AssetManager
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
              users={systemUsers.filter(u => u.orgId === currentOrg.id)}
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
              users={systemUsers.filter(u => u.orgId === currentOrg.id)}
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
            />
          )}

          {activeTab === 'branches' && (
            <FacilitiesPanel
              currentOrg={currentOrg}
              currentUser={currentUser}
              branches={currentOrgBranches}
              departments={currentOrgDepartments}
              users={systemUsers.filter(u => u.orgId === currentOrg.id)}
              assets={filteredAssets}
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
              users={systemUsers}
              currentUser={currentUser}
              branches={currentOrgBranches}
              departments={currentOrgDepartments}
              assets={filteredAssets}
              auditLogs={filteredAuditLogs}
              onRegisterUser={handleRegisterUser}
              onInviteUser={handleInviteUser}
              onUpdateUser={handleUpdateUser}
              onDeleteUser={handleDeleteUser}
              onClearDummyUsers={handleClearDummyUsers}
            />
          )}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Quick Camera Barcode/QR Scanner Modal */}
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
        onEnrollScannedTag={(tag) => {
          setSearchQuery(tag);
          navigateToTab('assets');
        }}
        onUpdateAssetStatus={(assetId, st) => {
          handleBatchUpdateStatus([assetId], st);
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
          onEdit={(ast) => {
            setInspectingAsset(null);
            setSearchQuery(ast.assetCode);
            navigateToTab('assets');
          }}
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
    <AuthProvider>
      <NotificationProvider>
        <AssetProvider>
          <AppShell />
        </AssetProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
