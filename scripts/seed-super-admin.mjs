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

  const email = 'ismaelt42@gmail.com';
  const rawPassword = 'Tatenda3@4';
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Check if organizations exist
  const [orgs] = await conn.query('SELECT id FROM organizations LIMIT 1');
  const orgId = orgs[0]?.id || 'org-omnitech';

  // Check if branch exists
  const [branches] = await conn.query('SELECT id, name FROM branches LIMIT 1');
  const branchId = branches[0]?.id || 'branch-ny';
  const branchName = branches[0]?.name || 'New York Global HQ';

  // Check if dept exists
  const [depts] = await conn.query('SELECT id, name FROM departments LIMIT 1');
  const deptId = depts[0]?.id || 'dept-sec';
  const deptName = depts[0]?.name || 'Cybersecurity & InfoSec';

  console.log('Seeding Super Admin user into TiDB Cloud...');
  const upsertUserSql = `
    INSERT INTO users (
      id, org_id, email, full_name, role, status,
      department_id, department_name, branch_id, branch_name,
      password_hash, two_factor_enabled, avatar, version
    ) VALUES (
      'usr-super-admin-ismael', ?, ?, 'Ismael (Super Admin)', 'ADMIN', 'ACTIVE',
      ?, ?, ?, ?,
      ?, 0, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', 1
    ) ON DUPLICATE KEY UPDATE
      org_id = VALUES(org_id),
      full_name = 'Ismael (Super Admin)',
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
    deptName,
    branchId,
    branchName,
    passwordHash
  ]);

  console.log(`✅ Super Admin (${email}) successfully provisioned in TiDB Cloud!`);
  const [check] = await conn.query('SELECT id, email, role, org_id, status FROM users WHERE email = ?', [email]);
  console.log('Verified user in database:', check);

  await conn.end();
}

run().catch((err) => {
  console.error('Error seeding super admin:', err);
  process.exit(1);
});
