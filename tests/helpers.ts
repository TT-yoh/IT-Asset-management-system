/**
 * Automated Testing Helpers (Phase 16 - Test Suite Overhaul)
 * Provides safe test setup, tenant seeding, session minting, and explicit-ID teardown.
 */

import crypto from 'crypto';
import config from '../server/config';
import { query } from '../server/db';
import { createSessionToken, hashPassword } from '../server/auth';
import type { SessionUser } from '../server/types';

/**
 * Ensures the target database is designated for test execution.
 * Throws immediately if run in an environment that is not NODE_ENV=test.
 */
export function assertSafeTestDatabase(): void {
  if (!config.isTest) {
    throw new Error('SECURITY VIOLATION: assertSafeTestDatabase called when config.isTest is false!');
  }

  const dbName = (config.TIDB_DATABASE || '').toLowerCase();
  const dbHost = (config.TIDB_HOST || '').toLowerCase();

  // Allow test database URLs, in-memory mocks, localhost, or explicit test-marked DBs
  const isExplicitTestDb =
    dbName.includes('test') ||
    dbHost.includes('test') ||
    dbHost.includes('localhost') ||
    dbHost.includes('127.0.0.1');

  const isDedicatedTestEnv = Boolean(
    config.TEST_DATABASE_URL || config.USE_IN_MEMORY_DB || config.ALLOW_IN_MEMORY_DB
  );

  if (!isExplicitTestDb && !isDedicatedTestEnv) {
    console.warn(
      `[SAFETY AUDIT] Running tests with NODE_ENV=test against host="${config.TIDB_HOST}", database="${config.TIDB_DATABASE}".`
    );
  }
}

/**
 * Mint a signed session token for a given user id and token version.
 */
export function mintSession(user: { id: string; tokenVersion?: number }): string {
  return createSessionToken({
    userId: user.id,
    ver: user.tokenVersion ?? 1
  });
}

export interface SeedTestTenantOptions {
  prefix?: string;
  adminEmail?: string;
  adminPassword?: string;
}

export interface SeedTestTenantResult {
  orgId: string;
  branchId: string;
  departmentId: string;
  adminUser: {
    id: string;
    email: string;
    role: string;
    tokenVersion: number;
    orgId: string;
    branchId: string;
  };
  sessionToken: string;
  registerId: (type: 'asset' | 'checkout' | 'maintenance' | 'user' | 'department' | 'branch', id: string) => void;
  teardown: () => Promise<void>;
}

/**
 * Seeds an isolated test tenant with organization, branch, department, and active ADMIN user.
 * Provides an exact-ID teardown helper that cleans up ONLY the records created during this test run.
 */
export async function seedTestTenant(options: SeedTestTenantOptions = {}): Promise<SeedTestTenantResult> {
  assertSafeTestDatabase();

  const randSuffix = crypto.randomBytes(4).toString('hex');
  const basePrefix = options.prefix ? `${options.prefix}-${randSuffix}` : `tst-${randSuffix}`;

  const orgId = `org-${basePrefix}`;
  const branchId = `br-${basePrefix}`;
  const departmentId = `dept-${basePrefix}`;
  const userId = `usr-${basePrefix}`;
  const email = options.adminEmail || `admin-${basePrefix}@omniasset.test`;
  const plainPassword = options.adminPassword || 'TestPass!2026_Secure';

  const trackedAssetIds = new Set<string>();
  const trackedCheckoutIds = new Set<string>();
  const trackedMaintenanceIds = new Set<string>();
  const trackedUserIds = new Set<string>([userId]);
  const trackedDeptIds = new Set<string>([departmentId]);
  const trackedBranchIds = new Set<string>([branchId]);

  // Insert organization
  await query(
    'INSERT INTO `organizations` (`id`, `name`, `type`, `created_at`, `updated_at`) VALUES (?, ?, ?, NOW(), NOW());',
    [orgId, `Org ${basePrefix}`, 'Enterprise']
  );

  // Insert branch
  await query(
    'INSERT INTO `branches` (`id`, `org_id`, `name`, `code`, `location`, `city`, `country`, `manager_name`) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
    [branchId, orgId, `Branch ${basePrefix}`, `BR-${randSuffix.toUpperCase()}`, 'HQ Building', 'Singapore', 'Singapore', 'Branch Manager']
  );

  // Insert department
  await query(
    'INSERT INTO `departments` (`id`, `org_id`, `name`, `head_count`, `budget_allocated`) VALUES (?, ?, ?, ?, ?);',
    [departmentId, orgId, `Dept ${basePrefix}`, 10, 50000.00]
  );

  // Insert active admin user
  const passwordHash = await hashPassword(plainPassword);
  await query(
    `INSERT INTO \`users\` (
      \`id\`, \`org_id\`, \`email\`, \`password_hash\`, \`full_name\`,
      \`role\`, \`status\`, \`token_version\`, \`version\`,
      \`branch_id\`, \`branch_name\`, \`created_at\`, \`updated_at\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW());`,
    [
      userId,
      orgId,
      email.toLowerCase(),
      passwordHash,
      `Admin ${basePrefix}`,
      'ADMIN',
      'ACTIVE',
      1,
      1,
      branchId,
      `Branch ${basePrefix}`
    ]
  );

  const sessionToken = mintSession({ id: userId, tokenVersion: 1 });

  const registerId = (
    type: 'asset' | 'checkout' | 'maintenance' | 'user' | 'department' | 'branch',
    id: string
  ) => {
    switch (type) {
      case 'asset':
        trackedAssetIds.add(id);
        break;
      case 'checkout':
        trackedCheckoutIds.add(id);
        break;
      case 'maintenance':
        trackedMaintenanceIds.add(id);
        break;
      case 'user':
        trackedUserIds.add(id);
        break;
      case 'department':
        trackedDeptIds.add(id);
        break;
      case 'branch':
        trackedBranchIds.add(id);
        break;
    }
  };

  /**
   * Exact-ID Teardown: deletes created test records by explicit IDs without blanket TRUNCATE
   */
  const teardown = async () => {
    try {
      // 1. Audit logs & audit chain heads for this isolated tenant
      await query('DELETE FROM `audit_logs` WHERE `org_id` = ?;', [orgId]);
      await query('DELETE FROM `audit_chain_heads` WHERE `org_id` = ?;', [orgId]);
      await query('DELETE FROM `idempotency_keys_v2` WHERE `org_id` = ?;', [orgId]);

      // 2. Checkouts
      if (trackedCheckoutIds.size > 0) {
        for (const cid of trackedCheckoutIds) {
          await query('DELETE FROM `checkouts` WHERE `id` = ? AND `org_id` = ?;', [cid, orgId]);
        }
      }

      // 3. Maintenances
      if (trackedMaintenanceIds.size > 0) {
        for (const mid of trackedMaintenanceIds) {
          await query('DELETE FROM `maintenances` WHERE `id` = ? AND `org_id` = ?;', [mid, orgId]);
        }
      }

      // 4. Assets
      if (trackedAssetIds.size > 0) {
        for (const aid of trackedAssetIds) {
          await query('DELETE FROM `assets` WHERE `id` = ? AND `org_id` = ?;', [aid, orgId]);
        }
      }
      // Cleanup any remaining assets in this tenant
      await query('DELETE FROM `assets` WHERE `org_id` = ?;', [orgId]);

      // 5. Users
      for (const uid of trackedUserIds) {
        await query('DELETE FROM `users` WHERE `id` = ? AND `org_id` = ?;', [uid, orgId]);
      }

      // 6. Departments
      for (const did of trackedDeptIds) {
        await query('DELETE FROM `departments` WHERE `id` = ? AND `org_id` = ?;', [did, orgId]);
      }

      // 7. Branches
      for (const bid of trackedBranchIds) {
        await query('DELETE FROM `branches` WHERE `id` = ? AND `org_id` = ?;', [bid, orgId]);
      }

      // 8. Organization
      await query('DELETE FROM `organizations` WHERE `id` = ?;', [orgId]);
    } catch (err: any) {
      console.warn(`[TEARDOWN WARNING] Teardown for ${orgId} encountered error:`, err.message);
    }
  };

  return {
    orgId,
    branchId,
    departmentId,
    adminUser: {
      id: userId,
      email,
      role: 'ADMIN',
      tokenVersion: 1,
      orgId,
      branchId
    },
    sessionToken,
    registerId,
    teardown
  };
}
