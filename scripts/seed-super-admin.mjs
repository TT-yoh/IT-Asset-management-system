import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const host = process.env.TIDB_HOST;
  const port = Number(process.env.TIDB_PORT) || 4000;
  const user = process.env.TIDB_USER;
  const password = process.env.TIDB_PASSWORD;
  const database = process.env.TIDB_DATABASE;

  if (!host || !user || !password || !database) {
    throw new Error('Missing required TiDB environment variables (TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE).');
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const rawPassword = process.env.ADMIN_PASSWORD;

  if (!email || !rawPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.');
  }

  const adminId = process.env.ADMIN_ID || 'usr-admin-primary';
  const adminName = process.env.ADMIN_NAME || 'System Administrator';

  console.log(`📡 Connecting to TiDB Cloud at ${host}:${port} as ${user}...`);
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
  });

  const passwordHash = await bcrypt.hash(rawPassword, 12);

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

  console.log('Seeding Administrator user into TiDB Cloud...');
  const upsertUserSql = `
    INSERT INTO users (
      id, org_id, email, full_name, role, status,
      department_id, department_name, branch_id, branch_name,
      password_hash, two_factor_enabled, avatar, version
    ) VALUES (
      ?, ?, ?, ?, 'ADMIN', 'ACTIVE',
      ?, ?, ?, ?,
      ?, 0, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', 1
    ) ON DUPLICATE KEY UPDATE
      org_id = VALUES(org_id),
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
    adminId,
    orgId,
    email,
    adminName,
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
