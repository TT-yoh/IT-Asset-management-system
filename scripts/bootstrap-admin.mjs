import mysql from 'mysql2/promise';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../server/config.ts';

async function main() {
  const host = config.TIDB_HOST;
  const port = config.TIDB_PORT;
  const user = config.TIDB_USER;
  const password = config.TIDB_PASSWORD;
  const database = config.TIDB_DATABASE;

  if (!host || !user || !password || !database) {
    console.error('FATAL: Database configuration missing in server/config (TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE).');
    process.exit(1);
  }

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

  try {
    // 1. Check organization
    const [orgs] = await conn.query<any[]>('SELECT id, name FROM organizations LIMIT 1;');
    if (!orgs || orgs.length === 0) {
      console.error('FATAL: No organizations found. Please run initial migration first.');
      process.exit(1);
    }
    const orgId = orgs[0].id;

    // 2. Check branch
    const [branches] = await conn.query<any[]>('SELECT id, name FROM branches WHERE org_id = ? LIMIT 1;', [orgId]);
    if (!branches || branches.length === 0) {
      console.error('FATAL: No branch found in organization. Please provision a branch first.');
      process.exit(1);
    }
    const branchId = branches[0].id;
    const branchName = branches[0].name;

    // 3. Generate secure random password
    const rawPassword = crypto.randomBytes(18).toString('base64url'); // 24 characters
    const passwordHash = await bcrypt.hash(rawPassword, 12);
    const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@omniasset.internal').trim().toLowerCase();
    const adminId = `usr-${crypto.randomUUID()}`;

    // 4. Insert or update bootstrap admin
    const insertSql = `
      INSERT INTO users (
        id, org_id, email, full_name, role, status,
        branch_id, branch_name, password_hash, is_super_admin,
        two_factor_enabled, version, token_version
      ) VALUES (
        ?, ?, ?, 'System Administrator', 'ADMIN', 'ACTIVE',
        ?, ?, ?, 1,
        0, 1, 1
      ) ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        is_super_admin = 1,
        status = 'ACTIVE',
        token_version = token_version + 1,
        version = version + 1;
    `;

    await conn.query(insertSql, [
      adminId,
      orgId,
      adminEmail,
      branchId,
      branchName,
      passwordHash
    ]);

    console.log('\n============================================================');
    console.log('   OMNIASSET FIRST ADMINISTRATOR BOOTSTRAPPED');
    console.log('============================================================');
    console.log(` Email:    ${adminEmail}`);
    console.log(` Password: ${rawPassword}`);
    console.log('============================================================');
    console.log(' IMPORTANT: Store this temporary password securely.');
    console.log(' It will NOT be printed again.');
    console.log(' You must change this password immediately upon first login.');
    console.log('============================================================\n');

  } catch (err) {
    console.error('FATAL Bootstrap Error:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

