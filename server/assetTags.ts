import { withTransaction } from './db';
import { HttpError } from './errors';
import {
  categoryTagCode,
  deriveOrgTagPrefix,
  formatAssetTag,
  normalizeTagPrefix
} from '../shared/asset-tags';

/** Upper bound on numbers skipped because a tag was already used by hand. */
const MAX_SKIP_ATTEMPTS = 500;

export interface IssuedAssetTag {
  tag: string;
  orgPrefix: string;
  categoryCode: string;
  sequence: number;
  /** True when the number was reserved; false for a preview that may still change. */
  reserved: boolean;
}

/**
 * Work out the next ORG-CAT-00001 tag for an organization and category.
 *
 * With `reserve: true` the number is consumed: the counter row is locked for
 * the duration of the transaction, so concurrent callers always receive
 * different tags. With `reserve: false` nothing is written and the result is
 * only a preview of what the next reservation would return.
 *
 * Numbers already used by an existing asset (for example a tag typed by hand)
 * are skipped, and a number is never handed out twice.
 */
export async function issueNextAssetTag(
  orgId: string,
  categoryId: string | undefined,
  categoryName: string | undefined,
  options: { reserve: boolean }
): Promise<IssuedAssetTag> {
  const categoryCode = categoryTagCode(categoryId, categoryName);

  return withTransaction(async (tx) => {
    const orgs = await tx(
      options.reserve
        ? 'SELECT `name`, `tag_prefix` FROM `organizations` WHERE `id` = ? LIMIT 1 FOR UPDATE;'
        : 'SELECT `name`, `tag_prefix` FROM `organizations` WHERE `id` = ? LIMIT 1;',
      [orgId]
    );
    if (orgs.length === 0) {
      throw new HttpError(404, 'Organization not found.', 'ORG_NOT_FOUND');
    }

    const storedPrefix = normalizeTagPrefix(orgs[0].tag_prefix);
    const orgPrefix = storedPrefix || deriveOrgTagPrefix(orgs[0].name);

    if (options.reserve) {
      // Pin the derived prefix on first use so renaming the organization later
      // cannot change the prefix part-way through a numbering sequence.
      if (!storedPrefix) {
        await tx('UPDATE `organizations` SET `tag_prefix` = ? WHERE `id` = ?;', [orgPrefix, orgId]);
      }
      await tx(
        'INSERT IGNORE INTO `asset_tag_counters` (`org_id`, `category_code`, `last_seq`) VALUES (?, ?, 0);',
        [orgId, categoryCode]
      );
    }

    const counters = await tx(
      options.reserve
        ? 'SELECT `last_seq` FROM `asset_tag_counters` WHERE `org_id` = ? AND `category_code` = ? LIMIT 1 FOR UPDATE;'
        : 'SELECT `last_seq` FROM `asset_tag_counters` WHERE `org_id` = ? AND `category_code` = ? LIMIT 1;',
      [orgId, categoryCode]
    );
    let sequence = Number(counters[0]?.last_seq || 0);

    let tag = '';
    for (let attempt = 0; attempt < MAX_SKIP_ATTEMPTS; attempt++) {
      sequence += 1;
      tag = formatAssetTag(orgPrefix, categoryCode, sequence);
      const taken = await tx('SELECT `id` FROM `assets` WHERE `org_id` = ? AND `asset_code` = ? LIMIT 1;', [orgId, tag]);
      if (taken.length === 0) break;
      tag = '';
    }
    if (!tag) {
      throw new HttpError(409, 'Could not find a free asset tag. Please enter one manually.', 'ASSET_TAG_EXHAUSTED');
    }

    if (options.reserve) {
      await tx(
        'UPDATE `asset_tag_counters` SET `last_seq` = ? WHERE `org_id` = ? AND `category_code` = ?;',
        [sequence, orgId, categoryCode]
      );
    }

    return { tag, orgPrefix, categoryCode, sequence, reserved: options.reserve };
  });
}
