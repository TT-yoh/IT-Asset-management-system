/**
 * Asset tag sequence integration tests (server/assetTags.ts).
 * Requires migration 007_asset_tag_sequences to be applied. Runs against an
 * isolated throwaway tenant that is removed afterwards.
 */
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Test execution aborted: NODE_ENV must be set to "test" via cross-env');
}

import { query, closePool } from '../server/db';
import { issueNextAssetTag } from '../server/assetTags';
import { seedTestTenant, SeedTestTenantResult } from './helpers';

let passed = 0;
let failed = 0;

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ❌ FAIL: ${name}`);
    console.log(`     ${err?.message || err}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function main() {
  console.log('🏷️  Running Asset Tag Sequence Tests...\n');
  let tenant: SeedTestTenantResult | null = null;

  try {
    tenant = await seedTestTenant({ prefix: 'tag' });
    const orgId = tenant.orgId;
    await query('UPDATE `organizations` SET `name` = ? WHERE `id` = ?;', ['Tag Sequence Works', orgId]);

    await step('1. Preview derives the prefix and does not reserve a number', async () => {
      const first = await issueNextAssetTag(orgId, 'cat-lap', 'Laptops & Ultrabooks', { reserve: false });
      const second = await issueNextAssetTag(orgId, 'cat-lap', 'Laptops & Ultrabooks', { reserve: false });
      assertEqual(first.tag, 'TSW-LPT-00001', 'first preview');
      assertEqual(second.tag, 'TSW-LPT-00001', 'second preview is unchanged');
      assertEqual(first.reserved, false, 'reserved flag');
      const counters = await query('SELECT `last_seq` FROM `asset_tag_counters` WHERE `org_id` = ?;', [orgId]);
      assertEqual(counters.length, 0, 'no counter row written by previews');
    });

    await step('2. Reserving hands out consecutive numbers per category', async () => {
      const a = await issueNextAssetTag(orgId, 'cat-lap', 'Laptops & Ultrabooks', { reserve: true });
      const b = await issueNextAssetTag(orgId, 'cat-lap', 'Laptops & Ultrabooks', { reserve: true });
      const phone = await issueNextAssetTag(orgId, 'cat-phone', 'Smartphones & Mobile Fleet', { reserve: true });
      assertEqual(a.tag, 'TSW-LPT-00001', 'first laptop tag');
      assertEqual(b.tag, 'TSW-LPT-00002', 'second laptop tag');
      assertEqual(phone.tag, 'TSW-PHN-00001', 'phones have their own sequence');
    });

    await step('3. The prefix is pinned on first reservation and survives a rename', async () => {
      const rows = await query<any>('SELECT `tag_prefix` FROM `organizations` WHERE `id` = ?;', [orgId]);
      assertEqual(rows[0]?.tag_prefix, 'TSW', 'stored prefix');
      await query('UPDATE `organizations` SET `name` = ? WHERE `id` = ?;', ['Completely Different Name', orgId]);
      const next = await issueNextAssetTag(orgId, 'cat-lap', 'Laptops & Ultrabooks', { reserve: true });
      assertEqual(next.tag, 'TSW-LPT-00003', 'prefix unchanged after rename');
    });

    await step('4. Concurrent reservations never return the same tag', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => issueNextAssetTag(orgId, 'cat-net', 'Networking & Security Gear', { reserve: true }))
      );
      const tags = results.map((r) => r.tag).sort();
      assertEqual(new Set(tags).size, 8, 'distinct tags');
      assertEqual(tags[0], 'TSW-NET-00001', 'lowest tag');
      assertEqual(tags[7], 'TSW-NET-00008', 'highest tag (no gaps)');
    });

    await step('5. Numbers already used by a hand-typed tag are skipped', async () => {
      const assetId = `ast-${orgId}-manual`;
      await query(
        'INSERT INTO `assets` (`id`, `org_id`, `branch_id`, `category_id`, `asset_code`, `name`, `serial_number`, `purchase_date`) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE());',
        [assetId, orgId, tenant!.branchId, 'cat-mon', 'TSW-MON-00001', 'Manually tagged monitor', `SN-${assetId}`]
      );
      tenant!.registerId('asset', assetId);
      const preview = await issueNextAssetTag(orgId, 'cat-mon', 'Monitors & AV Conferencing', { reserve: false });
      const reserved = await issueNextAssetTag(orgId, 'cat-mon', 'Monitors & AV Conferencing', { reserve: true });
      assertEqual(preview.tag, 'TSW-MON-00002', 'preview skips the used number');
      assertEqual(reserved.tag, 'TSW-MON-00002', 'reservation skips the used number');
    });

    await step('6. Unknown categories use the general code', async () => {
      const issued = await issueNextAssetTag(orgId, 'custom-xyz', 'Office Furniture', { reserve: true });
      assertEqual(issued.tag, 'TSW-GEN-00001', 'general category tag');
    });

    await step('7. An unknown organization is rejected', async () => {
      let message = '';
      try {
        await issueNextAssetTag('org-does-not-exist-000', 'cat-lap', 'Laptops', { reserve: true });
      } catch (err: any) {
        message = err?.message || '';
      }
      if (!/not found/i.test(message)) throw new Error(`expected a not-found error, got "${message}"`);
    });
  } finally {
    if (tenant) {
      await query('DELETE FROM `asset_tag_counters` WHERE `org_id` = ?;', [tenant.orgId]).catch(() => undefined);
      await tenant.teardown().catch((err: any) => console.warn('Teardown notice:', err?.message));
    }
  }

  console.log('\n==========================================');
  console.log(`Asset Tag Sequence Summary: ${passed} Passed, ${failed} Failed`);
  console.log('==========================================\n');

  await closePool().catch(() => undefined);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Asset tag sequence test crashed:', err);
  process.exit(1);
});
