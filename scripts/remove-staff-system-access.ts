/**
 * One-off: take system access away from everyone in an organization except a keep-list.
 *
 * Only IT and management sign in (see shared/permissions.ts hasSystemAccess). Everyone
 * else becomes a staff record (role USER): still in the staff list and still holding
 * their assets, but with no invite, no password reset and no session. Pending invite
 * links stop working because the invite token is cleared.
 *
 * Usage (dry run first, it changes nothing):
 *   npx cross-env NODE_ENV=development tsx scripts/remove-staff-system-access.ts --org <orgId> --keep a@x.com,b@y.com --actor <keeper email>
 *   ...same command with --apply to make the changes (one audit entry per person).
 */
import { query, withTransaction, closePool } from '../server/db';
import { recordAuditEvent } from '../server/audit';
import { STAFF_ROLE } from '../shared/permissions';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const orgId = arg('org');
  const keep = (arg('keep') || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const actorEmail = (arg('actor') || '').trim().toLowerCase();
  const apply = process.argv.includes('--apply');

  if (!orgId || keep.length === 0 || !actorEmail || !keep.includes(actorEmail)) {
    throw new Error('Pass --org <orgId>, --keep <comma-separated emails> and --actor <one of the kept emails>.');
  }

  const users = await query<any>(
    'SELECT `id`, `email`, `full_name`, `role`, `status`, `invite_token_hash` FROM `users` WHERE `org_id` = ? ORDER BY `full_name`;',
    [orgId]
  );
  const actor = users.find(u => (u.email || '').toLowerCase() === actorEmail);
  if (!actor) throw new Error(`Actor ${actorEmail} is not in organization ${orgId}.`);

  const missing = keep.filter(e => !users.some(u => (u.email || '').toLowerCase() === e));
  if (missing.length > 0) throw new Error(`Not found in ${orgId}, refusing to continue: ${missing.join(', ')}`);

  const kept = users.filter(u => keep.includes((u.email || '').toLowerCase()));
  const targets = users.filter(u => !keep.includes((u.email || '').toLowerCase()) && u.status !== 'DELETED');
  const alreadyDone = targets.filter(u => u.role === STAFF_ROLE && u.status !== 'INVITED' && !u.invite_token_hash);
  const changes = targets.filter(u => !alreadyDone.includes(u));

  console.log(`Organization: ${orgId}   Mode: ${apply ? 'APPLY' : 'DRY RUN (nothing is changed)'}`);
  console.log(`\nKeep system access (${kept.length}):`);
  kept.forEach(u => console.log(`  ✔ ${u.full_name} <${u.email}> ${u.role} ${u.status}`));
  console.log(`\nRemove system access (${changes.length}):`);
  changes.forEach(u => console.log(`  ✘ ${u.full_name} <${u.email || 'no email'}> ${u.role} ${u.status} -> ${STAFF_ROLE} ${u.status === 'INVITED' ? 'ACTIVE' : u.status}${u.invite_token_hash ? ', invite link cancelled' : ''}`));
  if (alreadyDone.length) console.log(`\nAlready staff without access, left alone: ${alreadyDone.length}`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to make these changes.');
    return;
  }

  for (const u of changes) {
    await withTransaction(async (tx) => {
      await tx(
        "UPDATE `users` SET `role` = ?, `status` = IF(`status` = 'INVITED', 'ACTIVE', `status`), `invite_token_hash` = NULL, `invite_expires_at` = NULL, `reset_token_hash` = NULL, `reset_expires_at` = NULL, `token_version` = `token_version` + 1, `version` = `version` + 1 WHERE `id` = ? AND `org_id` = ?;",
        [STAFF_ROLE, u.id, orgId]
      );
      await recordAuditEvent(tx, {
        orgId,
        actorId: actor.id,
        userName: actor.full_name,
        role: actor.role,
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: u.id,
        entityName: u.full_name,
        changes: {
          systemAccess: false,
          previousRole: u.role,
          updatedRole: STAFF_ROLE,
          previousStatus: u.status,
          updatedStatus: u.status === 'INVITED' ? 'ACTIVE' : u.status,
          reason: 'Only IT and management keep system access'
        }
      });
    });
    console.log(`  done: ${u.full_name}`);
  }
  console.log(`\nApplied to ${changes.length} account(s).`);
}

main()
  .catch((err) => {
    console.error(`\nFAILED: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
