/**
 * Asset field rules unit tests (shared/asset-fields.ts). Pure functions, no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPEC_FIELDS,
  assetKind,
  cleanDate,
  cleanText,
  formatSpecValue,
  isSerialRequired,
  normalizeOwnershipType,
  sanitizeSpecs,
  specFieldsForCategory
} from '../shared/asset-fields';

test('categories map to a device kind', () => {
  assert.equal(assetKind('cat-lap', 'Laptops & Ultrabooks'), 'computer');
  assert.equal(assetKind('cat-desk', 'Desktops & Workstations'), 'computer');
  assert.equal(assetKind('cat-servers', 'Enterprise Servers & Compute'), 'server');
  assert.equal(assetKind('cat-phone', 'Smartphones & Mobile Fleet'), 'phone');
  assert.equal(assetKind('cat-net', 'Networking & Security Gear'), 'network');
  assert.equal(assetKind('cat-mon', 'Monitors & AV Conferencing'), 'monitor');
  assert.equal(assetKind('cat-print', 'Printers & Fleet Scanners'), 'printer');
  assert.equal(assetKind('cat-periph', 'Docks, Keyboards & Accessories'), 'accessory');
  assert.equal(assetKind('custom', 'Office Furniture'), 'general');
});

test('every spec field has a unique key within its kind and select fields have options', () => {
  for (const [kind, fields] of Object.entries(SPEC_FIELDS)) {
    const keys = fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `duplicate key in ${kind}`);
    for (const field of fields) {
      if (field.type === 'select') assert.ok(field.options && field.options.length > 0, `${kind}.${field.key} needs options`);
    }
  }
});

test('serial number is required for computers, servers and network gear only', () => {
  assert.equal(isSerialRequired('cat-lap', ''), true);
  assert.equal(isSerialRequired('cat-desk', ''), true);
  assert.equal(isSerialRequired('cat-servers', ''), true);
  assert.equal(isSerialRequired('cat-net', ''), true);
  assert.equal(isSerialRequired('cat-phone', ''), false);
  assert.equal(isSerialRequired('cat-mon', ''), false);
  assert.equal(isSerialRequired('cat-print', ''), false);
  assert.equal(isSerialRequired('cat-periph', ''), false);
  assert.equal(isSerialRequired('custom', 'Office Furniture'), false);
});

test('sanitizeSpecs keeps only the fields defined for the category and coerces types', () => {
  const specs = sanitizeSpecs('cat-lap', 'Laptops', {
    cpu: '  Intel Core i7-1370P  ',
    ramGb: '32',
    storageGb: 1024,
    diskEncrypted: 'true',
    rackPosition: 'Rack B2',
    __proto__: { polluted: true },
    unknownKey: 'x'
  });
  assert.deepEqual(specs, { cpu: 'Intel Core i7-1370P', ramGb: 32, storageGb: 1024, diskEncrypted: true });
});

test('sanitizeSpecs drops empty, malformed and out-of-range values', () => {
  const specs = sanitizeSpecs('cat-servers', 'Servers', {
    hostname: '   ',
    ramGb: -4,
    storageGb: 'lots',
    supportContractEnd: '31/12/2027',
    role: { nested: true },
    ipAddress: '10.0.20.15'
  });
  assert.deepEqual(specs, { ipAddress: '10.0.20.15' });
});

test('sanitizeSpecs validates dates, selects and booleans', () => {
  assert.deepEqual(sanitizeSpecs('cat-net', 'Network', { supportContractEnd: '2027-12-31T00:00:00.000Z' }), { supportContractEnd: '2027-12-31' });
  assert.deepEqual(sanitizeSpecs('cat-print', 'Printers', { printerType: 'Laser' }), { printerType: 'Laser' });
  assert.equal(sanitizeSpecs('cat-print', 'Printers', { printerType: 'Dot matrix' }), null);
  assert.deepEqual(sanitizeSpecs('cat-phone', 'Phones', { mdmEnrolled: false }), { mdmEnrolled: false });
  assert.equal(sanitizeSpecs('cat-phone', 'Phones', { mdmEnrolled: 'maybe' }), null);
});

test('sanitizeSpecs truncates long text and accepts JSON strings', () => {
  const long = 'x'.repeat(500);
  const specs = sanitizeSpecs('cat-mon', 'Monitors', JSON.stringify({ resolution: long, screenSizeInches: 27 }));
  assert.equal((specs!.resolution as string).length, 200);
  assert.equal(specs!.screenSizeInches, 27);
});

test('sanitizeSpecs returns null for unusable input and for kinds without spec fields', () => {
  assert.equal(sanitizeSpecs('cat-lap', 'Laptops', null), null);
  assert.equal(sanitizeSpecs('cat-lap', 'Laptops', 'not json'), null);
  assert.equal(sanitizeSpecs('cat-lap', 'Laptops', ['cpu']), null);
  assert.equal(sanitizeSpecs('cat-lap', 'Laptops', {}), null);
  assert.equal(sanitizeSpecs('cat-periph', 'Accessories', { cpu: 'i7' }), null);
  assert.equal(specFieldsForCategory('cat-periph', 'Accessories').length, 0);
});

test('changing category drops specs that no longer apply', () => {
  const laptopSpecs = { cpu: 'i7', ramGb: 16, os: 'Windows 11' };
  assert.deepEqual(sanitizeSpecs('cat-phone', 'Phones', laptopSpecs), { os: 'Windows 11' });
});

test('normalizeOwnershipType defaults to OWNED', () => {
  assert.equal(normalizeOwnershipType('leased'), 'LEASED');
  assert.equal(normalizeOwnershipType(' PERSONAL '), 'PERSONAL');
  assert.equal(normalizeOwnershipType('rented'), 'OWNED');
  assert.equal(normalizeOwnershipType(undefined), 'OWNED');
});

test('cleanText and cleanDate normalise free input', () => {
  assert.equal(cleanText('  Dell  ', 128), 'Dell');
  assert.equal(cleanText('', 128), null);
  assert.equal(cleanText(42, 128), null);
  assert.equal(cleanText('abcdef', 3), 'abc');
  assert.equal(cleanDate('2027-06-30'), '2027-06-30');
  assert.equal(cleanDate('2027-06-30 00:00:00'), '2027-06-30');
  assert.equal(cleanDate('30/06/2027'), null);
  assert.equal(cleanDate('2027-13-45'), null);
  assert.equal(cleanDate(null), null);
});

test('formatSpecValue adds units and yes/no', () => {
  const fields = specFieldsForCategory('cat-lap', 'Laptops');
  const ram = fields.find((f) => f.key === 'ramGb')!;
  const enc = fields.find((f) => f.key === 'diskEncrypted')!;
  assert.equal(formatSpecValue(ram, 16), '16 GB');
  assert.equal(formatSpecValue(enc, true), 'Yes');
  assert.equal(formatSpecValue(enc, false), 'No');
  assert.equal(formatSpecValue(ram, undefined), '');
});
