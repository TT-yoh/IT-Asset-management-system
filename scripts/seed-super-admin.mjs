import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../server/config.ts';

async function run() {
  const host = config.TIDB_HOST;
  const port = config.TIDB_PORT;
  const user = config.TIDB_USER;
  const password = config.TIDB_PASSWORD;
  const database = config.TIDB_DATABASE;

  if (!host || !user || !password || !database) {
    throw new Error('Missing required TiDB environment variables in config (TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE).');
  }

  const email = (config.ADMIN_EMAIL || '').trim().toLowerCase();
  const rawPassword = config.ADMIN_PASSWORD;

  if (!email || !rawPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD configuration settings are required.');
  }

  const adminId = config.ADMIN_ID || 'usr-admin-primary';
  const adminName = config.ADMIN_NAME || 'System Administrator';

  console.log(`📡 Connecting to TiDB Cloud at ${host}:${port} as ${user}...`);
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      ...(config.TIDB_CA_PATH && fs.existsSync(config.TIDB_CA_PATH)
        ? { ca: fs.readFileSync(config.TIDB_CA_PATH) }
        : {})
    }
  });

  const passwordHash = await bcrypt.hash(rawPassword, 12);

  // Check if organizations exist
  const [orgs] = await conn.query('SELECT id FROM organizations LIMIT 1');
  const orgId = orgs[0]?.id || 'org-omnitech';

  // Check if branch exists
  const [branches] = await conn.query('SELECT id, name FROM branches LIMIT 1');
  if (!branches || branches.length === 0) throw new Error('Cannot seed administrator: No branches found. Please create a branch first.');
  const branchId = branches[0].id;
  const branchName = branches[0].name;

  // Check if dept exists
  const [depts] = await conn.query('SELECT id, name FROM departments LIMIT 1');
  const deptId = depts[0]?.id || null;
  const deptName = depts[0]?.name || null;

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
