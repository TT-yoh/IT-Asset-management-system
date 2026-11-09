import mysql from 'mysql2/promise';
import fs from 'fs';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
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

  const rl = readline.createInterface({ input, output });

  try {
    console.log('\n============================================================');
    console.log('   OmniAsset Super-Administrator Provisioning Utility');
    console.log('============================================================\n');

    const rawEmail = await rl.question('Enter email of the user to grant Super-Admin status: ');
    const email = rawEmail.trim().toLowerCase();

    if (!email || !email.includes('@')) {
      console.error('Error: A valid corporate email address is required.');
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

    const [rows] = await conn.query<any[]>(
      'SELECT id, email, full_name, role, status, is_super_admin FROM users WHERE LOWER(email) = ? LIMIT 1;',
      [email]
    );

    if (!rows || rows.length === 0) {
      console.error(`Error: User with email "${email}" not found.`);
      await conn.end();
      process.exit(1);
    }

    const targetUser = rows[0];
    if (targetUser.status !== 'ACTIVE') {
      console.error(`Error: User "${email}" is in status "${targetUser.status}". Only ACTIVE users may be granted Super-Admin.`);
      await conn.end();
      process.exit(1);
    }

    if (targetUser.is_super_admin) {
      console.log(`ℹ️ User "${targetUser.full_name}" (${email}) already has is_super_admin=1.`);
      await conn.end();
      process.exit(0);
    }

    const confirm = await rl.question(`Are you sure you want to grant Super-Admin to "${targetUser.full_name}" (${email})? [y/N]: `);
    if (confirm.trim().toLowerCase() !== 'y' && confirm.trim().toLowerCase() !== 'yes') {
      console.log('Operation cancelled by operator.');
      await conn.end();
      process.exit(0);
    }

    await conn.query(
      'UPDATE users SET is_super_admin = 1, version = version + 1 WHERE id = ?;',
      [targetUser.id]
    );

    console.log(`\n✅ Successfully granted Super-Admin (is_super_admin=1) to ${targetUser.full_name} (${email}).`);
    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
