/**
 * DEPRECATED: Plaintext environment administrator seeding has been completely removed in Phase 4 / Addendum 3.
 *
 * To provision the initial system administrator, execute:
 *   node scripts/bootstrap-admin.mjs
 *
 * To elevate an existing user to Super Admin interactively, execute:
 *   node scripts/grant-super-admin.mjs
 */

console.error('❌ scripts/seed-super-admin.mjs is deprecated and removed.');
console.error('👉 Use "node scripts/bootstrap-admin.mjs" to provision the first admin with a one-time random password.');
console.error('👉 Use "node scripts/grant-super-admin.mjs" to grant super-admin privileges interactively.');
process.exit(1);
