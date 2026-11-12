/**
 * Asset tag format shared by server and client: ORG-CAT-00001
 *
 *  - ORG: short organization prefix (2-5 letters/digits), so a found or
 *    repaired device shows whose it is.
 *  - CAT: fixed category code.
 *  - 00001: per-organization, per-category running number handed out by the
 *    server, zero-padded so tags sort and read cleanly.
 *
 * Nothing that can change later (branch, department, custodian) is encoded.
 */

export const TAG_SEQUENCE_DIGITS = 5;
export const GENERAL_CATEGORY_CODE = 'GEN';

/** Category codes by the built-in category ids. */
const CATEGORY_CODES_BY_ID: Readonly<Record<string, string>> = {
  'cat-lap': 'LPT',
  'cat-desk': 'DSK',
  'cat-servers': 'SRV',
  'cat-phone': 'PHN',
  'cat-net': 'NET',
  'cat-mon': 'MON',
  'cat-print': 'PRN',
  'cat-periph': 'ACC'
};

/** Fallback for custom categories: match on words in the category name. */
const CATEGORY_CODES_BY_KEYWORD: ReadonlyArray<readonly [RegExp, string]> = [
  [/laptop|ultrabook|notebook/i, 'LPT'],
  [/desktop|workstation/i, 'DSK'],
  [/server|compute|storage/i, 'SRV'],
  [/phone|mobile|tablet|ipad/i, 'PHN'],
  [/network|switch|router|firewall|access point/i, 'NET'],
  [/monitor|display|conferenc/i, 'MON'],
  [/print|scanner/i, 'PRN'],
  [/dock|keyboard|mouse|accessor|peripheral/i, 'ACC']
];

export function categoryTagCode(categoryId?: string | null, categoryName?: string | null): string {
  if (categoryId && CATEGORY_CODES_BY_ID[categoryId]) return CATEGORY_CODES_BY_ID[categoryId]!;
  const name = categoryName || '';
  for (const [pattern, code] of CATEGORY_CODES_BY_KEYWORD) {
    if (pattern.test(name)) return code;
  }
  return GENERAL_CATEGORY_CODE;
}

/** Returns a clean 2-5 character prefix, or null when the input cannot be used. */
export function normalizeTagPrefix(input?: string | null): string | null {
  const clean = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 2) return null;
  return clean.slice(0, 5);
}

/**
 * Default prefix for an organization that has not chosen one:
 * initials for multi-word names ("Apex Global Logistics" -> "AGL"),
 * otherwise the first three letters ("Mineazy" -> "MIN").
 */
export function deriveOrgTagPrefix(orgName?: string | null): string {
  const words = String(orgName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'AST';

  let prefix = words.length >= 2 ? words.slice(0, 4).map((w) => w[0]).join('') : words[0]!.slice(0, 3);
  if (prefix.length < 3) {
    // Two-word names: pad with the next letters of the first word ("Nova Biotech" -> "NBO").
    prefix = (prefix + words[0]!.slice(1)).slice(0, 3);
  }
  return normalizeTagPrefix(prefix) || 'AST';
}

export function formatAssetTag(orgPrefix: string, categoryCode: string, sequence: number): string {
  return `${orgPrefix}-${categoryCode}-${String(sequence).padStart(TAG_SEQUENCE_DIGITS, '0')}`;
}

/** True when a tag has the generated ORG-CAT-00001 shape. */
export function isGeneratedAssetTag(tag?: string | null): boolean {
  return /^[A-Z0-9]{2,5}-[A-Z]{3}-\d{5,}$/.test(String(tag || '').trim());
}
