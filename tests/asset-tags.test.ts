/**
 * Asset tag format unit tests (shared/asset-tags.ts). Pure functions, no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryTagCode,
  deriveOrgTagPrefix,
  formatAssetTag,
  isGeneratedAssetTag,
  normalizeTagPrefix
} from '../shared/asset-tags';

test('built-in categories map to fixed codes', () => {
  assert.equal(categoryTagCode('cat-lap', 'Laptops & Ultrabooks'), 'LPT');
  assert.equal(categoryTagCode('cat-desk', 'Desktops & Workstations'), 'DSK');
  assert.equal(categoryTagCode('cat-servers', 'Enterprise Servers & Compute'), 'SRV');
  assert.equal(categoryTagCode('cat-phone', 'Smartphones & Mobile Fleet'), 'PHN');
  assert.equal(categoryTagCode('cat-net', 'Networking & Security Gear'), 'NET');
  assert.equal(categoryTagCode('cat-mon', 'Monitors & AV Conferencing'), 'MON');
  assert.equal(categoryTagCode('cat-print', 'Printers & Fleet Scanners'), 'PRN');
  assert.equal(categoryTagCode('cat-periph', 'Docks, Keyboards & Accessories'), 'ACC');
});

test('the category id wins over a misleading name', () => {
  assert.equal(categoryTagCode('cat-lap', 'Server room spares'), 'LPT');
});

test('custom categories fall back to name keywords, then to GEN', () => {
  assert.equal(categoryTagCode('custom-1', 'Rugged Tablets'), 'PHN');
  assert.equal(categoryTagCode(undefined, 'Core Switches'), 'NET');
  assert.equal(categoryTagCode('custom-2', 'Office Furniture'), 'GEN');
  assert.equal(categoryTagCode(undefined, undefined), 'GEN');
});

test('normalizeTagPrefix keeps 2-5 uppercase letters/digits', () => {
  assert.equal(normalizeTagPrefix(' mnz '), 'MNZ');
  assert.equal(normalizeTagPrefix('a-b.c 1'), 'ABC1');
  assert.equal(normalizeTagPrefix('toolongprefix'), 'TOOLO');
  assert.equal(normalizeTagPrefix('x'), null);
  assert.equal(normalizeTagPrefix(''), null);
  assert.equal(normalizeTagPrefix(null), null);
});

test('deriveOrgTagPrefix uses initials for multi-word names and three letters otherwise', () => {
  assert.equal(deriveOrgTagPrefix('Apex Global Logistics'), 'AGL');
  assert.equal(deriveOrgTagPrefix('Mineazy'), 'MIN');
  assert.equal(deriveOrgTagPrefix('Nova Biotech'), 'NBO');
  assert.equal(deriveOrgTagPrefix('The Very Long Company Name Ltd'), 'TVLC');
  assert.equal(deriveOrgTagPrefix("O'Brien & Sons"), 'OBS');
  assert.equal(deriveOrgTagPrefix(''), 'AST');
  assert.equal(deriveOrgTagPrefix(null), 'AST');
});

test('formatAssetTag zero-pads to five digits and grows beyond them', () => {
  assert.equal(formatAssetTag('MNZ', 'LPT', 42), 'MNZ-LPT-00042');
  assert.equal(formatAssetTag('MNZ', 'LPT', 99999), 'MNZ-LPT-99999');
  assert.equal(formatAssetTag('MNZ', 'LPT', 100000), 'MNZ-LPT-100000');
});

test('isGeneratedAssetTag recognises the generated shape only', () => {
  assert.equal(isGeneratedAssetTag('MNZ-LPT-00042'), true);
  assert.equal(isGeneratedAssetTag(' AGL-GEN-00001 '), true);
  assert.equal(isGeneratedAssetTag('AST-LPT-4827'), false);
  assert.equal(isGeneratedAssetTag('CORP-042'), false);
  assert.equal(isGeneratedAssetTag(''), false);
});

test('tags sort in issue order as plain strings', () => {
  const tags = [9, 10, 2, 100].map((n) => formatAssetTag('MNZ', 'LPT', n));
  assert.deepEqual([...tags].sort(), ['MNZ-LPT-00002', 'MNZ-LPT-00009', 'MNZ-LPT-00010', 'MNZ-LPT-00100']);
});
