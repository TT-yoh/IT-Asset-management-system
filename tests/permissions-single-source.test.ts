import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ROLE_PERMISSIONS,
  hasPermission,
  canAccessAsset,
  canAccessTab,
  canAssignRole,
  canApproveWriteOff,
  canCertifyDamagedReturn
} from '../shared/permissions';
import type { UserRole } from '../src/types';

describe('Permissions Single Source of Truth & Asset Access Scoping', () => {
  it('asserts src/lib/rbac.ts does NOT exist (single source enforced)', () => {
    const legacyPath = path.resolve(process.cwd(), 'src/lib/rbac.ts');
    assert.equal(
      fs.existsSync(legacyPath),
      false,
      'Legacy src/lib/rbac.ts must be deleted; permissions must only live in shared/permissions.ts'
    );
  });

  it('asserts shared/permissions.ts defines all expected system roles', () => {
    const expectedRoles: UserRole[] = [
      'ADMIN',
      'DIRECTOR',
      'BRANCH_MANAGER',
      'IT_SUPPORT',
      'FINANCE',
      'USER'
    ];
    for (const role of expectedRoles) {
      assert.ok(ROLE_PERMISSIONS[role], `ROLE_PERMISSIONS must have entry for role: ${role}`);
      assert.ok(Array.isArray(ROLE_PERMISSIONS[role]), `ROLE_PERMISSIONS[${role}] must be an array`);
    }
  });

  describe('canAccessAsset - Scoping & Fail-Closed Rules', () => {
    const userOrgId = 'org-alpha';
    const otherOrgId = 'org-beta';
    const branch1 = 'branch-main';
    const branch2 = 'branch-east';

    const testAsset = {
      id: 'asset-1',
      orgId: userOrgId,
      branchId: branch1,
      name: 'Test Laptop',
      status: 'ACTIVE' as const
    };

    it('denies access if user and asset belong to different organizations (cross-tenant barrier)', () => {
      const crossOrgAsset = { ...testAsset, orgId: otherOrgId };
      const adminUser = { id: 'u1', orgId: userOrgId, role: 'ADMIN' as UserRole };
      assert.equal(
        canAccessAsset(adminUser, crossOrgAsset),
        false,
        'ADMIN in org-alpha must not access assets in org-beta'
      );
    });

    it('super admin can access cross-org assets if isSuperAdmin is true', () => {
      const crossOrgAsset = { ...testAsset, orgId: otherOrgId };
      const superAdmin = { id: 'u-super', orgId: userOrgId, role: 'ADMIN' as UserRole, isSuperAdmin: true };
      assert.equal(
        canAccessAsset(superAdmin, crossOrgAsset),
        true,
        'Super admin with isSuperAdmin=true should have global read access'
      );
    });

    it('org-wide roles (ADMIN, DIRECTOR, FINANCE, IT_SUPPORT) have access across all branches in their org', () => {
      const orgWideRoles: UserRole[] = ['ADMIN', 'DIRECTOR', 'FINANCE', 'IT_SUPPORT'];
      for (const role of orgWideRoles) {
        const user = { id: `u-${role}`, orgId: userOrgId, role, branchId: branch2 };
        assert.equal(
          canAccessAsset(user, testAsset),
          true,
          `${role} should access assets in any branch within same org`
        );
      }
    });

    it('BRANCH_MANAGER accesses assets ONLY in their assigned branch', () => {
      const bmSameBranch = { id: 'u-bm1', orgId: userOrgId, role: 'BRANCH_MANAGER' as UserRole, branchId: branch1 };
      const bmOtherBranch = { id: 'u-bm2', orgId: userOrgId, role: 'BRANCH_MANAGER' as UserRole, branchId: branch2 };

      assert.equal(
        canAccessAsset(bmSameBranch, testAsset),
        true,
        'BRANCH_MANAGER must access assets in their branch'
      );
      assert.equal(
        canAccessAsset(bmOtherBranch, testAsset),
        false,
        'BRANCH_MANAGER must NOT access assets in other branches'
      );
    });

    it('BRANCH_MANAGER fails closed (denies access) if branchId is null, undefined, or empty', () => {
      const bmNoBranch1 = { id: 'u-bm3', orgId: userOrgId, role: 'BRANCH_MANAGER' as UserRole, branchId: undefined };
      const bmNoBranch2 = { id: 'u-bm4', orgId: userOrgId, role: 'BRANCH_MANAGER' as UserRole, branchId: '' };

      assert.equal(
        canAccessAsset(bmNoBranch1, testAsset),
        false,
        'BRANCH_MANAGER without branchId must fail closed'
      );
      assert.equal(
        canAccessAsset(bmNoBranch2, testAsset),
        false,
        'BRANCH_MANAGER with empty branchId must fail closed'
      );
    });

    it('USER role accesses assets ONLY in their assigned branch', () => {
      const userSameBranch = { id: 'u-reg1', orgId: userOrgId, role: 'USER' as UserRole, branchId: branch1 };
      const userOtherBranch = { id: 'u-reg2', orgId: userOrgId, role: 'USER' as UserRole, branchId: branch2 };

      assert.equal(
        canAccessAsset(userSameBranch, testAsset),
        true,
        'USER must access assets in their branch'
      );
      assert.equal(
        canAccessAsset(userOtherBranch, testAsset),
        false,
        'USER must NOT access assets in other branches'
      );
    });

    it('USER role fails closed if branchId is missing', () => {
      const userNoBranch = { id: 'u-reg3', orgId: userOrgId, role: 'USER' as UserRole, branchId: undefined };
      assert.equal(
        canAccessAsset(userNoBranch, testAsset),
        false,
        'USER without branchId must fail closed'
      );
    });

    it('denies access if user or asset is null/undefined', () => {
      assert.equal(canAccessAsset(null as any, testAsset), false);
      assert.equal(canAccessAsset({ id: 'u1', orgId: userOrgId, role: 'ADMIN' }, null as any), false);
    });
  });

  describe('canApproveWriteOff - Segregation of Duties (SoD)', () => {
    const actorId = 'user-approver';
    const otherId = 'user-other';

    it('denies approval if actor is the asset creator (SoD rule)', () => {
      assert.equal(
        canApproveWriteOff(actorId, otherId, 'ADMIN', actorId, otherId),
        false,
        'Asset creator cannot approve their own asset write-off'
      );
    });

    it('denies approval if actor is the requester (SoD rule)', () => {
      assert.equal(
        canApproveWriteOff(actorId, otherId, 'ADMIN', otherId, actorId),
        false,
        'Requester cannot approve write-off'
      );
    });

    it('denies approval if actor is the custody holder (SoD rule)', () => {
      assert.equal(
        canApproveWriteOff(actorId, actorId, 'ADMIN', otherId, otherId),
        false,
        'Current custodian cannot approve write-off'
      );
    });

    it('allows approval when actor holds assets:writeoff permission and is independent', () => {
      assert.equal(
        canApproveWriteOff(actorId, otherId, 'ADMIN', otherId, otherId),
        true,
        'Independent ADMIN can approve write-off'
      );
      assert.equal(
        canApproveWriteOff(actorId, otherId, 'FINANCE', otherId, otherId),
        true,
        'Independent FINANCE can approve write-off'
      );
      assert.equal(
        canApproveWriteOff(actorId, otherId, 'USER', otherId, otherId),
        false,
        'USER lacks assets:writeoff permission'
      );
    });
  });

  describe('canCertifyDamagedReturn', () => {
    const actorId = 'user-certifier';
    const otherId = 'user-custodian';

    it('allows ADMIN, IT_SUPPORT, and FINANCE to certify damaged returns across org', () => {
      assert.equal(canCertifyDamagedReturn(actorId, otherId, 'ADMIN'), true);
      assert.equal(canCertifyDamagedReturn(actorId, otherId, 'IT_SUPPORT'), true);
      assert.equal(canCertifyDamagedReturn(actorId, otherId, 'FINANCE'), true);
    });

    it('denies when custodian attempts to self-certify damage', () => {
      assert.equal(canCertifyDamagedReturn(actorId, actorId, 'ADMIN'), false);
    });

    it('allows BRANCH_MANAGER for their own branch', () => {
      assert.equal(canCertifyDamagedReturn(actorId, otherId, 'BRANCH_MANAGER', 'branch-1', 'branch-1'), true);
      assert.equal(canCertifyDamagedReturn(actorId, otherId, 'BRANCH_MANAGER', 'branch-1', 'branch-2'), false);
      assert.equal(canCertifyDamagedReturn(actorId, otherId, 'BRANCH_MANAGER', undefined, 'branch-1'), false);
    });

    it('denies regular USER from certifying damaged returns', () => {
      assert.equal(canCertifyDamagedReturn(actorId, otherId, 'USER', 'branch-1', 'branch-1'), false);
    });
  });
});
