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
import { LoginPortal } from './components/auth/LoginPortal';
import { TiDBSyncModal } from './components/TiDBSyncModal';
import { QuickScannerModal } from './components/QuickScannerModal';
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

const VALID_TABS: NavTab[] = ['dashboard', 'assets', 'checkout', 'repair', 'users', 'reports', 'budget', 'audit'];

const getTabFromHash = (): NavTab => {
  if (typeof window === 'undefined') return 'dashboard';
  const clean = window.location.hash.replace(/^#\/?/, '').trim();
  return VALID_TABS.includes(clean as NavTab) ? (clean as NavTab) : 'dashboard';
};

function AppShell() {
  const {
    currentUser,
    currentOrg,
    systemOrgs,
    systemUsers,
    currentOrgBranches,
    handleLoginSuccess,
    handleRegisterOrganization,
    handleActivateUser,
    handleRegisterUser,
    handleUpdateUser,
    handleClearDummyUsers,
    handleUpdateBranch,
    handleRegisterBranch,
    handleSwitchUser,
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
      const nextTab = getTabFromHash();
      setActiveTabState(nextTab);
    };

    window.addEventListener('popstate', handleHistoryChange);
    window.addEventListener('hashchange', handleHistoryChange);

    if (currentUser && !window.location.hash) {
      window.history.replaceState({ tab: 'dashboard' }, '', '#/dashboard');
    }

    return () => {
      window.removeEventListener('popstate', handleHistoryChange);
      window.removeEventListener('hashchange', handleHistoryChange);
    };
  }, [currentUser]);

  // If not authenticated, render LoginPortal
  if (!currentUser) {
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
          currentUser={currentUser}
          isMobileDrawerOpen={isMobileMenuOpen}
          onToggleMobileDrawer={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onCloseMobileDrawer={() => setIsMobileMenuOpen(false)}
        />

        <main className="flex-1 overflow-y-auto bg-slate-950 p-2 sm:p-4 md:p-6 pb-24 md:pb-8">
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

          {activeTab === 'users' && (
            <UsersPanel
              currentOrg={currentOrg}
              users={systemUsers}
              currentUser={currentUser}
              branches={currentOrgBranches}
              assets={filteredAssets}
              auditLogs={filteredAuditLogs}
              onRegisterUser={handleRegisterUser}
              onClearDummyUsers={handleClearDummyUsers}
            />
          )}
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
      />

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
