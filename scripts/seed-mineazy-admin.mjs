import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const host = process.env.TIDB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com';
  const port = Number(process.env.TIDB_PORT) || 4000;
  const user = process.env.TIDB_USER;
  const password = process.env.TIDB_PASSWORD;
  const database = process.env.TIDB_DATABASE || 'it_asset_ledger';

  console.log(`📡 Connecting to TiDB Cloud at ${host}:${port} as ${user}...`);
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  const orgId = 'org-mineazy';
  const branchId = 'branch-mineazy-hq';
  const deptId = 'dept-it-mineazy';
  const email = 'admin@mineazy.com';
  const rawPassword = 'Mineazy123!';
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  console.log('1. Ensuring Organization `org-mineazy` exists in TiDB Cloud...');
  await conn.query(`
    INSERT INTO organizations (id, name, type, branding_color, branches_count)
    VALUES (?, 'Mineazy Mining Solutions', 'Mining & Enterprise', '#0f766e', 1)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      branding_color = VALUES(branding_color);
  `, [orgId]);

  console.log('2. Ensuring Branch `branch-mineazy-hq` exists in TiDB Cloud...');
  await conn.query(`
    INSERT INTO branches (id, org_id, name, code, location, city, country, manager_name)
    VALUES (?, ?, 'Mineazy Operations HQ', 'MZ-HQ-01', 'Mineral Innovation Park, Wing A', 'Harare', 'Zimbabwe', 'Mineazy Admin')
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      manager_name = VALUES(manager_name);
  `, [branchId, orgId]);

  console.log('3. Ensuring Department `dept-it-mineazy` exists in TiDB Cloud...');
  await conn.query(`
    INSERT INTO departments (id, org_id, name, head_count, budget_allocated)
    VALUES (?, ?, 'IT Infrastructure & Telemetry', 5, 150000.00)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name);
  `, [deptId, orgId]);

  console.log('4. Seeding Admin User `admin@mineazy.com` into TiDB Cloud...');
  const upsertUserSql = `
    INSERT INTO users (
      id, org_id, email, full_name, role, status,
      department_id, department_name, branch_id, branch_name,
      password_hash, two_factor_enabled, avatar, version
    ) VALUES (
      'usr-admin-mineazy', ?, ?, 'Mineazy Admin', 'ADMIN', 'ACTIVE',
      ?, 'IT Infrastructure & Telemetry', ?, 'Mineazy Operations HQ',
      ?, 0, 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80', 1
    ) ON DUPLICATE KEY UPDATE
      org_id = VALUES(org_id),
      email = VALUES(email),
      full_name = VALUES(full_name),
      role = 'ADMIN',
      status = 'ACTIVE',
      department_id = VALUES(department_id),
      department_name = VALUES(department_name),
      branch_id = VALUES(branch_id),
      branch_name = VALUES(branch_name),
      password_hash = VALUES(password_hash),
      two_factor_enabled = 0,
      version = version + 1;
  `;

  await conn.query(upsertUserSql, [
    orgId,
    email,
    deptId,
    branchId,
    passwordHash
  ]);

  console.log(`✅ Admin user (${email}) successfully provisioned in TiDB Cloud!`);
  const [check] = await conn.query('SELECT id, email, role, org_id, status FROM users WHERE email = ?', [email]);
  console.log('Verified user in database:', check);

  await conn.end();
}

run().catch((err) => {
  console.error('Error seeding Mineazy admin:', err);
  process.exit(1);
});
