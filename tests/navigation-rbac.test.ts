import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessTab,
  TAB_PERMISSIONS,
  NavTab,
  ROLE_PERMISSIONS,
  canAssignRole,
  canApproveWriteOff,
  canCertifyDamagedReturn,
  hasPermission
} from '../shared/permissions';
import { UserRole } from '../src/types';

describe('RBAC Navigation & Tab Access Guard', () => {
  const ALL_TABS: NavTab[] = [
    'dashboard',
    'assets',
    'checkout',
    'repair',
    'users',
    'branches',
    'reports',
    'budget',
    'audit'
  ];

  it('ADMIN has access to all 9 navigation tabs', () => {
    for (const tab of ALL_TABS) {
      assert.equal(
        canAccessTab('ADMIN', tab),
        true,
        `ADMIN should have access to ${tab}`
      );
    }
  });

  it('DIRECTOR has access to all 9 navigation tabs', () => {
    for (const tab of ALL_TABS) {
      assert.equal(
        canAccessTab('DIRECTOR', tab),
        true,
        `DIRECTOR should have access to ${tab}`
      );
    }
  });

  it('BRANCH_MANAGER has access to 8 tabs including Budgets and Reports, but NOT Audit', () => {
    const allowed: NavTab[] = ['dashboard', 'assets', 'checkout', 'repair', 'users', 'branches', 'reports', 'budget'];
    for (const tab of ALL_TABS) {
      const shouldAccess = allowed.includes(tab);
      assert.equal(
        canAccessTab('BRANCH_MANAGER', tab),
        shouldAccess,
        `BRANCH_MANAGER access to ${tab} should be ${shouldAccess}`
      );
    }
  });

  it('IT_SUPPORT has access to 7 tabs including Audit, but NOT Reports or Budgets', () => {
    const allowed: NavTab[] = ['dashboard', 'assets', 'checkout', 'repair', 'users', 'branches', 'audit'];
    for (const tab of ALL_TABS) {
      const shouldAccess = allowed.includes(tab);
      assert.equal(
        canAccessTab('IT_SUPPORT', tab),
        shouldAccess,
        `IT_SUPPORT access to ${tab} should be ${shouldAccess}`
      );
    }
  });

  it('FINANCE has access to all 9 tabs (including Audit, Reports, and Budgets)', () => {
    for (const tab of ALL_TABS) {
      assert.equal(
        canAccessTab('FINANCE', tab),
        true,
        `FINANCE should have access to ${tab}`
      );
    }
  });

  it('USER is strictly limited to dashboard, assets, checkout, repair, and branches', () => {
    const allowed: NavTab[] = ['dashboard', 'assets', 'checkout', 'repair', 'branches'];
    for (const tab of ALL_TABS) {
      const shouldAccess = allowed.includes(tab);
      assert.equal(
        canAccessTab('USER', tab),
        shouldAccess,
        `USER access to ${tab} should be ${shouldAccess}`
      );
    }
  });

  it('unauthenticated or unknown roles can only access dashboard', () => {
    assert.equal(canAccessTab(null, 'dashboard'), true);
    assert.equal(canAccessTab(undefined, 'dashboard'), true);
    assert.equal(canAccessTab('UNKNOWN' as any, 'dashboard'), true);

    for (const tab of ALL_TABS.filter(t => t !== 'dashboard')) {
      assert.equal(canAccessTab(null, tab), false);
      assert.equal(canAccessTab(undefined, tab), false);
      assert.equal(canAccessTab('GUEST' as any, tab), false);
    }
  });

  it('TAB_PERMISSIONS correctly maps each tab to permission actions', () => {
    assert.equal(TAB_PERMISSIONS.dashboard, null);
    assert.equal(TAB_PERMISSIONS.assets, 'assets:read');
    assert.equal(TAB_PERMISSIONS.checkout, 'checkouts:read');
    assert.equal(TAB_PERMISSIONS.repair, 'maintenance:read');
    assert.equal(TAB_PERMISSIONS.users, 'users:read');
    assert.equal(TAB_PERMISSIONS.branches, 'branches:read');
    assert.equal(TAB_PERMISSIONS.reports, 'reports:read');
    assert.equal(TAB_PERMISSIONS.budget, 'budgets:read');
    assert.equal(TAB_PERMISSIONS.audit, 'audit:read');
  });
});

describe('Separation of Duties (SoD) & Role Assignment', () => {
  it('canAssignRole allows only ADMIN to manage roles, and forbids granting SUPER_ADMIN', () => {
    assert.equal(canAssignRole('ADMIN', 'IT_SUPPORT'), true);
    assert.equal(canAssignRole('ADMIN', 'DIRECTOR'), true);
    assert.equal(canAssignRole('ADMIN', 'FINANCE'), true);
    assert.equal(canAssignRole('ADMIN', 'BRANCH_MANAGER'), true);
    assert.equal(canAssignRole('ADMIN', 'USER'), true);
    assert.equal(canAssignRole('ADMIN', 'ADMIN'), true);

    // Cannot grant SUPER_ADMIN as a role (must be DB flag)
    assert.equal(canAssignRole('ADMIN', 'SUPER_ADMIN' as any), false);

    // Non-admins cannot assign any roles
    const nonAdmins: UserRole[] = ['DIRECTOR', 'FINANCE', 'BRANCH_MANAGER', 'IT_SUPPORT', 'USER'];
    for (const role of nonAdmins) {
      assert.equal(canAssignRole(role, 'USER'), false);
      assert.equal(canAssignRole(role, 'ADMIN'), false);
    }
  });

  it('canApproveWriteOff enforces custody defense, creator defense, and requester defense', () => {
    // Valid approval by independent admin/IT support
    assert.equal(
      canApproveWriteOff('usr-admin-1', 'usr-custodian-2', 'ADMIN', 'usr-creator-3', 'usr-req-4'),
      true
    );

    // Custody holder cannot self-approve
    assert.equal(
      canApproveWriteOff('usr-same-person', 'usr-same-person', 'ADMIN', 'usr-creator-3', 'usr-req-4'),
      false
    );

    // Creator cannot approve (prevents ghost asset creation & writeoff)
    assert.equal(
      canApproveWriteOff('usr-same-person', 'usr-custodian-2', 'ADMIN', 'usr-same-person', 'usr-req-4'),
      false
    );

    // Requester cannot approve
    assert.equal(
      canApproveWriteOff('usr-same-person', 'usr-custodian-2', 'ADMIN', 'usr-creator-3', 'usr-same-person'),
      false
    );

    // Non-authorized roles cannot approve even if independent
    assert.equal(
      canApproveWriteOff('usr-indep', 'usr-custodian-2', 'USER', 'usr-creator-3', 'usr-req-4'),
      false
    );
    assert.equal(
      canApproveWriteOff('usr-indep', 'usr-custodian-2', 'BRANCH_MANAGER', 'usr-creator-3', 'usr-req-4'),
      false
    );
  });

  it('canCertifyDamagedReturn allows ADMIN/IT_SUPPORT/FINANCE org-wide, and BRANCH_MANAGER within branch', () => {
    // Custody holder cannot certify own damaged return
    assert.equal(
      canCertifyDamagedReturn('usr-same', 'usr-same', 'ADMIN'),
      false
    );

    // Org-wide roles can certify
    assert.equal(canCertifyDamagedReturn('usr-admin', 'usr-custodian', 'ADMIN'), true);
    assert.equal(canCertifyDamagedReturn('usr-it', 'usr-custodian', 'IT_SUPPORT'), true);
    assert.equal(canCertifyDamagedReturn('usr-fin', 'usr-custodian', 'FINANCE'), true);

    // Branch manager: allowed only within own branch
    assert.equal(
      canCertifyDamagedReturn('usr-bm', 'usr-custodian', 'BRANCH_MANAGER', 'branch-1', 'branch-1'),
      true
    );
    assert.equal(
      canCertifyDamagedReturn('usr-bm', 'usr-custodian', 'BRANCH_MANAGER', 'branch-1', 'branch-2'),
      false
    );

    // Regular users cannot certify damaged returns
    assert.equal(
      canCertifyDamagedReturn('usr-user', 'usr-custodian', 'USER', 'branch-1', 'branch-1'),
      false
    );
  });
});

