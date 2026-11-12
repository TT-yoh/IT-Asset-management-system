import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAgeMonths,
  calculateStraightLineDepreciation,
  calculateFleetValuation,
  normalizeCondition
} from '../shared/finance';
import { escapeCsvField } from '../src/lib/report-service';
import pkg from '../package.json';

describe('Shared Finance Depreciation Engine (shared/finance.ts)', () => {
  it('calculateAgeMonths calculates accurate elapsed months', () => {
    const pDate = '2025-01-15';
    const refDate = new Date('2026-01-15T00:00:00Z');
    const months = calculateAgeMonths(pDate, refDate);
    assert.equal(months, 12);

    const refDateHalf = new Date('2025-07-15T00:00:00Z');
    assert.equal(calculateAgeMonths(pDate, refDateHalf), 6);

    // Future date should clamp to 0
    const futureDate = '2030-01-01';
    assert.equal(calculateAgeMonths(futureDate, refDate), 0);
  });

  it('calculateStraightLineDepreciation applies 10% salvage factor and linear monthly rate', () => {
    const cost = 1000;
    const purchaseDate = '2024-01-01';
    // Useful life = 60 months (5 years), salvage factor = 0.10 (10%)
    // Salvage value = $100, depreciable base = $900
    // Monthly rate = 900 / 60 = $15.00/month

    // At age 10 months:
    const asOf10Mo = new Date('2024-11-01T00:00:00Z');
    const dep10 = calculateStraightLineDepreciation(cost, purchaseDate, {
      asOfDate: asOf10Mo,
      usefulLifeMonths: 60,
      salvageFactor: 0.10
    });

    assert.equal(dep10.salvageValue, 100);
    assert.equal(dep10.depreciableBase, 900);
    assert.equal(dep10.monthlyDepreciation, 15);
    assert.equal(dep10.accumulatedDepreciation, 150);
    assert.equal(dep10.bookValue, 850);
    assert.equal(dep10.depreciatedPercentage, 17); // 150 / 900 = 16.67% => 17%

    // At age 60 months (end of useful life):
    const asOf60Mo = new Date('2029-01-01T00:00:00Z');
    const dep60 = calculateStraightLineDepreciation(cost, purchaseDate, {
      asOfDate: asOf60Mo,
      usefulLifeMonths: 60,
      salvageFactor: 0.10
    });

    assert.equal(dep60.accumulatedDepreciation, 900);
    assert.equal(dep60.bookValue, 100);
    assert.equal(dep60.depreciatedPercentage, 100); // 900 / 900 = 100% of depreciable base

    // Past 60 months: book value stays pinned at salvage value ($100)
    const asOf80Mo = new Date('2030-09-01T00:00:00Z');
    const dep80 = calculateStraightLineDepreciation(cost, purchaseDate, {
      asOfDate: asOf80Mo,
      usefulLifeMonths: 60,
      salvageFactor: 0.10
    });

    assert.equal(dep80.bookValue, 100);
    assert.equal(dep80.accumulatedDepreciation, 900);
  });

  it('calculateFleetDepreciation excludes DISPOSED, SOLD, and DEPRECATED from active valuation', () => {
    const assets: any[] = [
      { id: '1', purchaseCost: 1000, purchaseDate: '2025-01-01', status: 'ACTIVE' },
      { id: '2', purchaseCost: 2000, purchaseDate: '2025-01-01', status: 'CHECKED_OUT' },
      { id: '3', purchaseCost: 3000, purchaseDate: '2025-01-01', status: 'REPAIR' },
      // Excluded from active valuation by default:
      { id: '4', purchaseCost: 5000, purchaseDate: '2025-01-01', status: 'DISPOSED' },
      { id: '5', purchaseCost: 4000, purchaseDate: '2025-01-01', status: 'SOLD' },
      { id: '6', purchaseCost: 2500, purchaseDate: '2025-01-01', status: 'DEPRECATED' },
      { id: '7', purchaseCost: 1500, purchaseDate: '2025-01-01', status: 'WRITTEN_OFF' }
    ];

    const fleet = calculateFleetValuation(assets);
    assert.equal(fleet.activeAssetsCount, 4); // ACTIVE, CHECKED_OUT, REPAIR, WRITTEN_OFF
    assert.equal(fleet.disposedAssetsCount, 3); // DISPOSED, SOLD, DEPRECATED
    assert.equal(fleet.totalPurchaseCost, 7500); // 1000 + 2000 + 3000 + 1500
  });

  it('normalizeCondition canonicalizes condition values to NEW, GOOD, FAIR, POOR', () => {
    assert.equal(normalizeCondition('NEW'), 'NEW');
    assert.equal(normalizeCondition('GOOD'), 'GOOD');
    assert.equal(normalizeCondition('FAIR'), 'FAIR');
    assert.equal(normalizeCondition('POOR'), 'POOR');

    // Mappings
    assert.equal(normalizeCondition('EXCELLENT'), 'NEW');
    assert.equal(normalizeCondition('LIKE NEW'), 'NEW');
    assert.equal(normalizeCondition('DAMAGED'), 'POOR');
    assert.equal(normalizeCondition('UNKNOWN'), 'GOOD');
    assert.equal(normalizeCondition(null), 'GOOD');
  });
});

describe('Formula Injection Defense & Export Sanitation', () => {
  it('escapeCsvField neutralizes formula triggers (=, +, -, @, \\t, \\r)', () => {
    assert.equal(escapeCsvField('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.equal(escapeCsvField('+12345'), "'+12345");
    assert.equal(escapeCsvField('-12345'), "'-12345");
    assert.equal(escapeCsvField('@cmd'), "'@cmd");
    assert.equal(escapeCsvField('\tcalc'), "'\tcalc");
    assert.equal(escapeCsvField('\rcalc'), "'\rcalc");

    // Normal values remain untouched
    assert.equal(escapeCsvField('Dell XPS 15'), 'Dell XPS 15');
    assert.equal(escapeCsvField(1250), 1250);
    assert.equal(escapeCsvField(null), null);
  });

  it('application package version is loaded from package.json (D3)', () => {
    assert.ok(pkg.version);
    assert.equal(pkg.version, '1.0.0');
  });
});
