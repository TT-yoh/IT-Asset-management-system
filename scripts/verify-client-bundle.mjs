#!/usr/bin/env node
/**
 * Post-Build Client Bundle Security Scanner (Phase 9.1 Hardened)
 * Scans dist/ artifacts for accidental leakage of:
 * - Database credentials, connection strings & gateway URLs
 * - Backend server secrets (SESSION_SECRET, TOTP_ENCRYPTION_KEY)
 * - Super admin backdoors and literal passwords
 * - Private API keys & service tokens
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('❌ Build directory dist/ does not exist. Run "npm run build" first.');
  process.exit(1);
}

const FORBIDDEN_PATTERNS = [
  { pattern: /TIDB_PASSWORD/i, name: 'Database Password Env Reference' },
  { pattern: /SESSION_SECRET/i, name: 'Session Secret Reference' },
  { pattern: /SESSION_SECRET_PREVIOUS/i, name: 'Previous Session Secret Reference' },
  { pattern: /TOTP_ENCRYPTION_KEY/i, name: 'TOTP Encryption Key Reference' },
  { pattern: /AUDIT_HMAC_KEY/i, name: 'Audit HMAC Key Reference' },
  { pattern: /\bVITE_[A-Za-z0-9_]*(?:SECRET|PASS|KEY|TOKEN|TIDB|GEMINI)/i, name: 'Prohibited VITE_* Secret Variable' },
  { pattern: /gateway\d+\.[\w.-]+\.tidbcloud\.com/i, name: 'Raw TiDB Cloud Gateway Host' },
  { pattern: /-----BEGIN (?:RSA )?PRIVATE KEY-----/, name: 'Raw RSA / Private Key' },
  { pattern: /AIzaSy[A-Za-z0-9_-]{33}/, name: 'Hardcoded Google API Key' },
  { pattern: /usr-super-admin-001/i, name: 'Hardcoded Super Admin ID' },
  { pattern: /Admin@12345/i, name: 'Hardcoded Default Admin Password' },
  { pattern: /Admin123!/i, name: 'Prohibited Default Admin Password' },
  { pattern: /OmniSecure2026!/i, name: 'Hardcoded Super Admin Password' }
];

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

console.log('🔍 Starting post-build client bundle security scan on dist/ ...\n');

const files = getAllFiles(distDir);
let violations = 0;

for (const filePath of files) {
  const ext = path.extname(filePath).toLowerCase();
  // Only inspect text/code bundle artifacts
  if (!['.js', '.mjs', '.html', '.css', '.map', '.json'].includes(ext)) {
    continue;
  }

  const relativePath = path.relative(distDir, filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  for (const { pattern, name } of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      console.error(`❌ SECURITY VIOLATION: ${name} detected in bundle: dist/${relativePath}`);
      violations++;
    }
  }
}

if (violations > 0) {
  console.error(`\n🚨 Build verification FAILED: ${violations} confidential pattern(s) leaked to client bundle!`);
  process.exit(1);
} else {
  console.log(`✅ Client bundle security verification passed: 0 secrets or prohibited identities detected across ${files.length} built artifacts.\n`);
  process.exit(0);
}
