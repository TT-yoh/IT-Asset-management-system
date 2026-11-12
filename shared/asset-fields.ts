/**
 * Asset record fields shared by server and client.
 *
 * Two groups:
 *  1. Fields every device has (manufacturer, supplier, invoice, location in
 *     branch, owning department, ownership type) - stored as ordinary columns.
 *  2. Fields that depend on the kind of device (CPU for a laptop, rack
 *     position for a server...) - stored together in the `specs` JSON column
 *     and described by the per-kind lists below. Adding a field or a new kind
 *     of device means editing this file only: no database change.
 */
import { categoryTagCode } from './asset-tags';

export type AssetKind = 'computer' | 'phone' | 'server' | 'network' | 'monitor' | 'printer' | 'accessory' | 'general';

export type SpecFieldType = 'text' | 'number' | 'select' | 'date' | 'boolean';

export interface SpecFieldDef {
  key: string;
  label: string;
  type: SpecFieldType;
  options?: readonly string[];
  placeholder?: string;
  /** Shown after the value, e.g. "GB". */
  unit?: string;
}

export type AssetSpecValue = string | number | boolean;
export type AssetSpecs = Record<string, AssetSpecValue>;

export const OWNERSHIP_TYPES = ['OWNED', 'LEASED', 'PERSONAL'] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

export const OWNERSHIP_LABELS: Readonly<Record<OwnershipType, string>> = {
  OWNED: 'Owned by the company',
  LEASED: 'Leased / rented',
  PERSONAL: 'Personal device (BYOD)'
};

export function normalizeOwnershipType(value: unknown): OwnershipType {
  const upper = String(value || '').toUpperCase().trim();
  return (OWNERSHIP_TYPES as readonly string[]).includes(upper) ? (upper as OwnershipType) : 'OWNED';
}

const KIND_BY_CATEGORY_CODE: Readonly<Record<string, AssetKind>> = {
  LPT: 'computer',
  DSK: 'computer',
  SRV: 'server',
  PHN: 'phone',
  NET: 'network',
  MON: 'monitor',
  PRN: 'printer',
  ACC: 'accessory'
};

export function assetKind(categoryId?: string | null, categoryName?: string | null): AssetKind {
  return KIND_BY_CATEGORY_CODE[categoryTagCode(categoryId, categoryName)] || 'general';
}

const OS_FIELD: SpecFieldDef = { key: 'os', label: 'Operating system', type: 'text', placeholder: 'e.g. Windows 11 Pro 24H2' };
const HOSTNAME_FIELD: SpecFieldDef = { key: 'hostname', label: 'Device / host name', type: 'text', placeholder: 'e.g. FIN-LPT-014' };
const IP_FIELD: SpecFieldDef = { key: 'ipAddress', label: 'IP address', type: 'text', placeholder: 'e.g. 10.0.20.15' };
const RACK_FIELD: SpecFieldDef = { key: 'rackPosition', label: 'Rack position', type: 'text', placeholder: 'e.g. Rack B2, U14-U15' };
const SUPPORT_END_FIELD: SpecFieldDef = { key: 'supportContractEnd', label: 'Support contract ends', type: 'date' };

export const SPEC_FIELDS: Readonly<Record<AssetKind, readonly SpecFieldDef[]>> = {
  computer: [
    { key: 'cpu', label: 'Processor', type: 'text', placeholder: 'e.g. Intel Core i7-1370P' },
    { key: 'ramGb', label: 'Memory', type: 'number', unit: 'GB', placeholder: '16' },
    { key: 'storageGb', label: 'Storage', type: 'number', unit: 'GB', placeholder: '512' },
    OS_FIELD,
    HOSTNAME_FIELD,
    { key: 'diskEncrypted', label: 'Disk encryption enabled', type: 'boolean' }
  ],
  phone: [
    { key: 'carrier', label: 'Mobile carrier', type: 'text', placeholder: 'e.g. Econet' },
    { key: 'storageGb', label: 'Storage', type: 'number', unit: 'GB', placeholder: '128' },
    OS_FIELD,
    { key: 'imei2', label: 'Second IMEI (dual-SIM)', type: 'text', placeholder: '15 digits' },
    { key: 'mdmEnrolled', label: 'Enrolled in device management (MDM)', type: 'boolean' }
  ],
  server: [
    HOSTNAME_FIELD,
    IP_FIELD,
    RACK_FIELD,
    OS_FIELD,
    { key: 'role', label: 'Role', type: 'text', placeholder: 'e.g. Database, file server, hypervisor' },
    { key: 'cpu', label: 'Processor', type: 'text', placeholder: 'e.g. 2x Xeon Silver 4410Y' },
    { key: 'ramGb', label: 'Memory', type: 'number', unit: 'GB', placeholder: '128' },
    { key: 'storageGb', label: 'Usable storage', type: 'number', unit: 'GB', placeholder: '4000' },
    SUPPORT_END_FIELD
  ],
  network: [
    { ...IP_FIELD, label: 'Management IP address' },
    { key: 'firmwareVersion', label: 'Firmware version', type: 'text', placeholder: 'e.g. 17.9.4a' },
    { key: 'portCount', label: 'Port count', type: 'number', placeholder: '48' },
    RACK_FIELD,
    SUPPORT_END_FIELD
  ],
  monitor: [
    { key: 'screenSizeInches', label: 'Screen size', type: 'number', unit: 'in', placeholder: '27' },
    { key: 'resolution', label: 'Resolution', type: 'text', placeholder: 'e.g. 3840 x 2160' }
  ],
  printer: [
    IP_FIELD,
    { key: 'printerType', label: 'Printer type', type: 'select', options: ['Laser', 'Inkjet', 'Thermal / label', 'Multifunction', 'Other'] },
    { key: 'consumableModel', label: 'Toner / cartridge model', type: 'text', placeholder: 'e.g. HP 59A' },
    { key: 'serviceContract', label: 'Service contract', type: 'text', placeholder: 'Provider and contract number' }
  ],
  accessory: [],
  general: []
};

export function specFieldsForCategory(categoryId?: string | null, categoryName?: string | null): readonly SpecFieldDef[] {
  return SPEC_FIELDS[assetKind(categoryId, categoryName)];
}

/** Serial numbers are mandatory for devices that are individually valuable or networked. */
export function isSerialRequired(categoryId?: string | null, categoryName?: string | null): boolean {
  const kind = assetKind(categoryId, categoryName);
  return kind === 'computer' || kind === 'server' || kind === 'network';
}

const MAX_SPEC_TEXT_LENGTH = 200;
const MAX_SPEC_NUMBER = 100_000_000;

function coerceSpecValue(def: SpecFieldDef, raw: unknown): AssetSpecValue | undefined {
  if (raw === null || raw === undefined) return undefined;

  switch (def.type) {
    case 'boolean':
      if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
      if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
      return undefined;
    case 'number': {
      if (typeof raw === 'string' && !raw.trim()) return undefined;
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0 || num > MAX_SPEC_NUMBER) return undefined;
      return num;
    }
    case 'date': {
      const text = String(raw).trim().slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? text : undefined;
    }
    case 'select': {
      const text = String(raw).trim();
      return def.options?.includes(text) ? text : undefined;
    }
    default: {
      if (typeof raw === 'object') return undefined;
      const text = String(raw).trim().slice(0, MAX_SPEC_TEXT_LENGTH);
      return text || undefined;
    }
  }
}

/**
 * Keep only the fields defined for this kind of device, with each value
 * coerced to its declared type. Unknown keys, empty values and malformed
 * values are dropped. Returns null when nothing is left.
 */
export function sanitizeSpecs(
  categoryId: string | null | undefined,
  categoryName: string | null | undefined,
  input: unknown
): AssetSpecs | null {
  let source: unknown = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;

  const result: AssetSpecs = {};
  for (const def of specFieldsForCategory(categoryId, categoryName)) {
    const value = coerceSpecValue(def, (source as Record<string, unknown>)[def.key]);
    if (value !== undefined) result[def.key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Human-readable value for display ("16 GB", "Yes"). */
export function formatSpecValue(def: SpecFieldDef, value: AssetSpecValue | undefined): string {
  if (value === undefined || value === '') return '';
  if (def.type === 'boolean') return value ? 'Yes' : 'No';
  return def.unit ? `${value} ${def.unit}` : String(value);
}

/** Trim a free-text column value; empty becomes null. */
export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, maxLength);
  return text || null;
}

/** Accepts YYYY-MM-DD (optionally with a time part); anything else becomes null. */
export function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? text : null;
}
