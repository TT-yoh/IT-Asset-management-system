import { query } from './db';
import { HttpError } from './errors';
import { cleanDate, cleanText, normalizeOwnershipType, sanitizeSpecs } from '../shared/asset-fields';

/** Values for the extended asset columns added in migration 008, ready to bind. */
export interface ExtendedAssetColumns {
  manufacturer: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  locationDetail: string | null;
  departmentId: string | null;
  departmentName: string | null;
  ownershipType: 'OWNED' | 'LEASED' | 'PERSONAL';
  leaseEndDate: string | null;
  /** JSON text for the `specs` column, or null. */
  specsJson: string | null;
}

/** Column list and placeholders in the order produced by extendedColumnValues(). */
export const EXTENDED_ASSET_COLUMN_SQL =
  '`manufacturer`, `supplier`, `invoice_number`, `location_detail`, `department_id`, `department_name`, `ownership_type`, `lease_end_date`, `specs`';
export const EXTENDED_ASSET_PLACEHOLDER_SQL = '?, ?, ?, ?, ?, ?, ?, ?, ?';
export const EXTENDED_ASSET_UPDATE_SQL =
  '`manufacturer` = ?, `supplier` = ?, `invoice_number` = ?, `location_detail` = ?, `department_id` = ?, `department_name` = ?, `ownership_type` = ?, `lease_end_date` = ?, `specs` = ?';

export function extendedColumnValues(cols: ExtendedAssetColumns): Array<string | null> {
  return [
    cols.manufacturer,
    cols.supplier,
    cols.invoiceNumber,
    cols.locationDetail,
    cols.departmentId,
    cols.departmentName,
    cols.ownershipType,
    cols.leaseEndDate,
    cols.specsJson
  ];
}

/** Read a request field by its camelCase or snake_case name; undefined when absent. */
function pick(data: any, camel: string, snake: string): unknown {
  if (data && data[camel] !== undefined) return data[camel];
  if (data && data[snake] !== undefined) return data[snake];
  return undefined;
}

/**
 * Work out the extended column values for a create or update.
 *
 * On update, pass the current row as `prev`: a field missing from the request
 * keeps its stored value, while a field sent as null or '' is cleared.
 * The department must belong to the caller's organization. Specs are filtered
 * to the fields defined for the asset's category, so changing category drops
 * values that no longer apply.
 */
export async function resolveExtendedAssetColumns(
  orgId: string,
  data: any,
  categoryId: string | null | undefined,
  categoryName: string | null | undefined,
  prev?: any
): Promise<ExtendedAssetColumns> {
  const text = (camel: string, snake: string, max: number): string | null => {
    const raw = pick(data, camel, snake);
    if (raw === undefined) return prev ? cleanText(prev[snake], max) : null;
    return cleanText(raw, max);
  };

  // Department: validated against the organization whenever it changes.
  let departmentId: string | null = prev?.department_id || null;
  let departmentName: string | null = prev?.department_name || null;
  const rawDepartment = pick(data, 'departmentId', 'department_id');
  if (rawDepartment !== undefined) {
    const requested = cleanText(rawDepartment, 64);
    if (!requested) {
      departmentId = null;
      departmentName = null;
    } else if (requested !== departmentId) {
      const rows = await query<any>(
        'SELECT `id`, `name` FROM `departments` WHERE `id` = ? AND `org_id` = ? AND `archived_at` IS NULL LIMIT 1;',
        [requested, orgId]
      );
      if (rows.length === 0) {
        throw new HttpError(400, 'Specified department does not exist in your organization.', 'INVALID_DEPARTMENT');
      }
      departmentId = rows[0].id;
      departmentName = rows[0].name;
    }
  }

  const rawOwnership = pick(data, 'ownershipType', 'ownership_type');
  const ownershipType = rawOwnership !== undefined
    ? normalizeOwnershipType(rawOwnership)
    : normalizeOwnershipType(prev?.ownership_type);

  const rawLeaseEnd = pick(data, 'leaseEndDate', 'lease_end_date');
  let leaseEndDate = rawLeaseEnd !== undefined ? cleanDate(rawLeaseEnd) : cleanDate(prev?.lease_end_date ?? null);
  if (ownershipType !== 'LEASED') leaseEndDate = null;

  const rawSpecs = pick(data, 'specs', 'specs');
  const specs = sanitizeSpecs(categoryId, categoryName, rawSpecs !== undefined ? rawSpecs : prev?.specs);

  return {
    manufacturer: text('manufacturer', 'manufacturer', 128),
    supplier: text('supplier', 'supplier', 255),
    invoiceNumber: text('invoiceNumber', 'invoice_number', 128),
    locationDetail: text('locationDetail', 'location_detail', 255),
    departmentId,
    departmentName,
    ownershipType,
    leaseEndDate,
    specsJson: specs ? JSON.stringify(specs) : null
  };
}
