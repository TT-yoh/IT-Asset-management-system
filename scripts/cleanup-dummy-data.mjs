/**
 * Purge all sample dummy data from TiDB Cloud database
 * Preserves ONLY the authenticated Super Admin and essential organizational taxonomies.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

const host = process.env.TIDB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com';
const port = Number(process.env.TIDB_PORT || 4000);
const user = process.env.TIDB_USER;
const password = process.env.TIDB_PASSWORD;
const database = process.env.TIDB_DATABASE || 'it_asset_ledger';

async function cleanup() {
  console.log(`📡 Connecting to TiDB Cloud database: ${database} at ${host}:${port}...`);
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  console.log('🧹 Purging dummy data across tables...');

  // 1. Clear checkouts & maintenance tickets
  await conn.query('DELETE FROM `maintenances`;');
  console.log('✓ Cleared maintenances table (0 tickets)');

  await conn.query('DELETE FROM `checkouts`;');
  console.log('✓ Cleared checkouts table (0 checkouts)');

  // 2. Clear assets
  await conn.query('DELETE FROM `assets`;');
  console.log('✓ Cleared assets table (0 assets)');

  // 3. Clear budgets
  await conn.query('DELETE FROM `budgets`;');
  console.log('✓ Cleared budgets table (0 allocations)');

  // 4. Clear dummy test branches except the main production branch
  await conn.query('DELETE FROM `branches` WHERE `id` != "branch-main";');
  
  // Ensure default main headquarters branch exists
  await conn.query(`
    INSERT INTO \`branches\` (\`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`)
    VALUES ('branch-main', 'org-omnitech', 'Global Headquarters', 'HQ-MAIN', 'Corporate HQ Tower, Floor 45', 'New York', 'United States', 'Ismael (Super Admin)')
    ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
  `);
  console.log('✓ Retained single clean production branch (Global Headquarters)');

  // 5. Ensure primary enterprise organization
  await conn.query(`
    INSERT INTO \`organizations\` (\`id\`, \`name\`, \`type\`, \`branding_color\`, \`branches_count\`)
    VALUES ('org-omnitech', 'OmniTech Enterprise Systems', 'Enterprise', '#0ea5e9', 1)
    ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`branding_color\` = VALUES(\`branding_color\`);
  `);
  // Remove dummy organizations if any
  await conn.query('DELETE FROM `organizations` WHERE `id` NOT IN ("org-omnitech");');
  console.log('✓ Retained single production organization (OmniTech Enterprise Systems)');

  // 6. Delete all dummy users, preserving ONLY Super Admin ismaelt42@gmail.com
  await conn.query('DELETE FROM `users` WHERE LOWER(`email`) != "ismaelt42@gmail.com";');
  
  // Upsert Super Admin with production bcrypt hash
  const superPasswordHash = await bcrypt.hash('Tatenda3@4', 12);
  await conn.query(`
    INSERT INTO \`users\` (
      \`id\`, \`org_id\`, \`email\`, \`password_hash\`, \`full_name\`, \`role\`,
      \`status\`, \`department_id\`, \`department_name\`, \`branch_id\`, \`branch_name\`, \`two_factor_enabled\`
    ) VALUES (
      'usr-super-admin-ismael', 'org-omnitech', 'ismaelt42@gmail.com', ?, 'Ismael (Super Admin)', 'ADMIN',
      'ACTIVE', 'dept-sec', 'Cybersecurity & InfoSec', 'branch-main', 'Global Headquarters', 0
    ) ON DUPLICATE KEY UPDATE
      \`password_hash\` = VALUES(\`password_hash\`),
      \`role\` = 'ADMIN',
      \`status\` = 'ACTIVE';
  `, [superPasswordHash]);
  console.log('✓ Preserved ONLY Super Admin account (ismaelt42@gmail.com)');

  // 7. Verify counts
  const [[{ assetCount }]] = await conn.query('SELECT COUNT(*) as assetCount FROM `assets`;');
  const [[{ checkoutCount }]] = await conn.query('SELECT COUNT(*) as checkoutCount FROM `checkouts`;');
  const [[{ userCount }]] = await conn.query('SELECT COUNT(*) as userCount FROM `users`;');
  const [[{ branchCount }]] = await conn.query('SELECT COUNT(*) as branchCount FROM `branches`;');

  console.log('\n📊 Production Database Status:');
  console.log(`   - Assets: ${assetCount}`);
  console.log(`   - Checkouts: ${checkoutCount}`);
  console.log(`   - Users: ${userCount} (Super Admin)`);
  console.log(`   - Branches: ${branchCount}`);

  await conn.end();
  console.log('\n✨ Database successfully reset to clean production state!\n');
}

cleanup().catch(err => {
  console.error('Cleanup error:', err);
  process.exit(1);
});
