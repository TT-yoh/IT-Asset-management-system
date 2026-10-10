/**
 * Seed baseline IT Asset Management data to PingCAP TiDB Cloud
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

const host = process.env.VITE_TIDB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com';
const port = Number(process.env.VITE_TIDB_PORT || 4000);
const user = process.env.VITE_TIDB_USER;
const password = process.env.VITE_TIDB_PASSWORD;
const database = process.env.VITE_TIDB_DATABASE || 'it_asset_ledger';

async function seed() {
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  console.log(`Connected to \`${database}\` for initial baseline seeding...`);

  // 1. Organization
  await connection.query(`
    INSERT INTO \`organizations\` (\`id\`, \`name\`, \`type\`, \`branding_color\`, \`branches_count\`)
    VALUES ('org-omnitech', 'OmniTech Global Systems', 'Enterprise', '#10b981', 3)
    ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
  `);
  console.log('✓ Seeded Organization');

  // 2. Branches
  const branches = [
    ['branch-ny', 'org-omnitech', 'New York Global HQ', 'NYC-HQ', '452 5th Avenue, Floors 12-16', 'New York', 'United States', 'David Vance'],
    ['branch-lon', 'org-omnitech', 'London Operations Hub', 'LON-01', '100 Bishopsgate', 'London', 'United Kingdom', 'Sarah Jenkins'],
    ['branch-sg', 'org-omnitech', 'Singapore APAC Center', 'SGP-01', '1 Marina Boulevard', 'Singapore', 'Singapore', 'Chen Wei']
  ];
  for (const b of branches) {
    await connection.query(`
      INSERT INTO \`branches\` (\`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
    `, b);
  }
  console.log('✓ Seeded Branches (3)');

  // 3. Departments
  const depts = [
    ['dept-eng', 'org-omnitech', 'Engineering & DevOps', 120, 450000.00],
    ['dept-sec', 'org-omnitech', 'Cybersecurity & InfoSec', 35, 280000.00],
    ['dept-ops', 'org-omnitech', 'Cloud Infrastructure', 50, 320000.00]
  ];
  for (const d of depts) {
    await connection.query(`
      INSERT INTO \`departments\` (\`id\`, \`org_id\`, \`name\`, \`head_count\`, \`budget_allocated\`)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
    `, d);
  }
  console.log('✓ Seeded Departments (3)');

  // 4. Staff Users
  const users = [
    ['usr-alex', 'org-omnitech', 'alex.mercer@omnitech.io', 'Alex Mercer', 'ADMIN', 'dept-eng', 'Engineering & DevOps', 'branch-ny', 'New York Global HQ', 1],
    ['usr-sarah', 'org-omnitech', 'sarah.jenkins@omnitech.io', 'Sarah Jenkins', 'BRANCH_MANAGER', 'dept-ops', 'Cloud Infrastructure', 'branch-lon', 'London Operations Hub', 1],
    ['usr-david', 'org-omnitech', 'david.vance@omnitech.io', 'David Vance', 'IT_SUPPORT', 'dept-sec', 'Cybersecurity & InfoSec', 'branch-ny', 'New York Global HQ', 0]
  ];
  for (const u of users) {
    await connection.query(`
      INSERT INTO \`users\` (\`id\`, \`org_id\`, \`email\`, \`full_name\`, \`role\`, \`department_id\`, \`department_name\`, \`branch_id\`, \`branch_name\`, \`two_factor_enabled\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE \`full_name\` = VALUES(\`full_name\`);
    `, u);
  }
  console.log('✓ Seeded Staff Users (3)');

  // 5. Asset Categories
  const categories = [
    ['cat-laptop', 'Laptops & Ultrabooks', 'Laptop', 'Developer MacBook Pros and ThinkPads', 3],
    ['cat-server', 'Enterprise Servers & Compute', 'Server', 'Dell PowerEdge and HPE Blade compute', 5],
    ['cat-net', 'Networking & Security Gear', 'Network', 'Cisco Catalyst switches and Palo Alto firewalls', 5]
  ];
  for (const c of categories) {
    await connection.query(`
      INSERT INTO \`asset_categories\` (\`id\`, \`name\`, \`icon\`, \`description\`, \`depreciation_years\`)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
    `, c);
  }
  console.log('✓ Seeded Asset Categories (3)');

  // 6. Assets
  const sampleAssets = [
    ['ast-001', 'org-omnitech', 'branch-ny', 'New York Global HQ', 'cat-laptop', 'Laptops & Ultrabooks', 'AST-MBP-01', 'MacBook Pro 16" M3 Max', 'Apple MBP 16', 'C02G871LMD6R', 'ACTIVE', 'GOOD', '2025-01-15', 3899.00, '2028-01-15', 3499.00, 'usr-alex', 'Alex Mercer'],
    ['ast-002', 'org-omnitech', 'branch-lon', 'London Operations Hub', 'cat-server', 'Enterprise Servers & Compute', 'AST-SRV-01', 'Dell PowerEdge R760 Rack Server', 'PowerEdge R760', 'SN-DELL-99812-UK', 'ACTIVE', 'NEW', '2025-02-10', 9800.00, '2030-02-10', 9400.00, 'usr-sarah', 'Sarah Jenkins'],
    ['ast-003', 'org-omnitech', 'branch-ny', 'New York Global HQ', 'cat-net', 'Networking & Security Gear', 'AST-NET-01', 'Cisco Nexus 9300 Backbone Switch', 'Nexus 9300-FX3', 'FOX2418P0AX', 'ACTIVE', 'GOOD', '2024-06-20', 4600.00, '2029-06-20', 3900.00, 'usr-david', 'David Vance']
  ];
  for (const a of sampleAssets) {
    await connection.query(`
      INSERT INTO \`assets\` (\`id\`, \`org_id\`, \`branch_id\`, \`branch_name\`, \`category_id\`, \`category_name\`, \`asset_code\`, \`name\`, \`model\`, \`serial_number\`, \`status\`, \`asset_condition\`, \`purchase_date\`, \`purchase_cost\`, \`warranty_expiry\`, \`current_value\`, \`assigned_to_user_id\`, \`assigned_to_user_name\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
    `, a);
  }
  console.log('✓ Seeded Baseline Hardware Assets (3)');

  await connection.end();
  console.log('\n🎉 Baseline seed data successfully populated in TiDB Cloud!\n');
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
